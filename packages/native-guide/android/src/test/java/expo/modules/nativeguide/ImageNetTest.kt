package expo.modules.nativeguide

import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Connection
import okhttp3.Interceptor
import okhttp3.MediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody
import okio.Buffer
import okio.BufferedSource
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** The image client (ImageNet.kt): its settings, and that every way a call can hang ends as a plain failure (never a
 *  cancellation, which Fresco never finishes), and its logging. Real sockets on loopback, no mock server. */
class ImageNetTest {
  private val logs: MutableList<String> = Collections.synchronizedList(mutableListOf())
  private val servers = mutableListOf<ServerSocket>()
  private val sockets: MutableList<Socket> = Collections.synchronizedList(mutableListOf())

  @After fun tearDown() {
    sockets.forEach { runCatching { it.close() } }
    servers.forEach { runCatching { it.close() } }
  }

  /** A local server that accepts, reads the request head, then runs `respond` (which may never answer). */
  private fun server(respond: (Socket) -> Unit): String {
    val ss = ServerSocket(0, 50, InetAddress.getLoopbackAddress())
    servers += ss
    Thread {
      while (!ss.isClosed) {
        val s = runCatching { ss.accept() }.getOrNull() ?: break
        sockets += s
        Thread {
          runCatching {
            val input = s.getInputStream().bufferedReader()
            while (true) {
              val line = input.readLine() ?: break
              if (line.isEmpty()) break
            }
            respond(s)
          }
        }.apply { isDaemon = true }.start()
      }
    }.apply { isDaemon = true }.start()
    return "http://127.0.0.1:${ss.localPort}"
  }

  /** Production settings with the timeouts cut down so the tests finish in a second or two. */
  private fun fast(s: ImageNet.Settings = ImageNet.Settings()) =
    s.copy(
      connectTimeoutMs = 400, readTimeoutMs = 300, writeTimeoutMs = 300,
      headersDeadlineMs = 800, progressWindowMs = 400, minWindowBytes = 64, maxCallMs = 5_000,
    )

  /** Headers at once, then `chunks` chunks of `chunkBytes` every `everyMs` (Content-Length = the total). */
  private fun steadyBody(chunks: Int, chunkBytes: Int, everyMs: Long): String = server { s ->
    val out = s.getOutputStream()
    out.write("HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nContent-Length: ${chunks * chunkBytes}\r\n\r\n".toByteArray())
    out.flush()
    val chunk = ByteArray(chunkBytes) { 0x41 }
    repeat(chunks) {
      out.write(chunk)
      out.flush()
      Thread.sleep(everyMs)
    }
  }

  private fun build(s: ImageNet.Settings) = ImageNet.build(OkHttpClient.Builder(), s) { logs += it }

  private fun failLines() = synchronized(logs) { logs.filter { it.startsWith("fail ") } }

  @Test fun productionSettings() {
    val c = build(ImageNet.Settings()).client
    assertEquals(4_000, c.connectTimeoutMillis)
    assertEquals(6_000, c.readTimeoutMillis)
    assertEquals(6_000, c.writeTimeoutMillis)
    // Never OkHttp's callTimeout: it cancels the call, which Fresco reports as a cancellation, not a failure.
    assertEquals(0, c.callTimeoutMillis)
    assertTrue(c.retryOnConnectionFailure)
    assertEquals(8, c.dispatcher.maxRequestsPerHost)
    assertEquals(24, c.dispatcher.maxRequests)
    // One config line at creation, nothing else.
    assertEquals(logs.toString(), 1, logs.size)
    assertEquals(
      "client connect=4000ms read=6000ms headers=12000ms floor=16384B/8000ms maxCall=60000ms perHost=8 max=24 keepAlive=30000ms",
      logs[0],
    )
  }

  @Test fun keepsTheBaseBuildersOtherSettings() {
    // React Native's builder carries its cookie jar; the image client keeps it (only timeouts, dispatcher and pool change).
    val jar = object : okhttp3.CookieJar {
      override fun saveFromResponse(url: okhttp3.HttpUrl, cookies: List<okhttp3.Cookie>) = Unit
      override fun loadForRequest(url: okhttp3.HttpUrl) = emptyList<okhttp3.Cookie>()
    }
    val base = OkHttpClient.Builder().cookieJar(jar).readTimeout(0, TimeUnit.MILLISECONDS)
    val c = ImageNet.build(base, ImageNet.Settings()) {}.client
    assertTrue(c.cookieJar === jar)
    assertEquals(6_000, c.readTimeoutMillis)
  }

  @Test fun aServerThatNeverAnswersIsAReadTimeoutFailureNotACancel() {
    val url = server { Thread.sleep(10_000) }
    val b = build(fast())
    val call = b.client.newCall(Request.Builder().url("$url/img/chan1?path=%2Flibrary%2Fmetadata%2F42%2Fthumb&w=320").build())
    val t0 = System.nanoTime()
    try {
      call.execute().close()
      fail("expected a timeout")
    } catch (e: SocketTimeoutException) {
      // expected
    }
    assertTrue("took ${(System.nanoTime() - t0) / 1_000_000}ms", (System.nanoTime() - t0) / 1_000_000 < 3_000)
    assertFalse("a timed-out image call must not read as cancelled", call.isCanceled())
    assertEquals(1, b.failures.total)
    val line = failLines().single()
    assertTrue(line, line.contains("kind=read-timeout"))
    assertTrue(line, line.contains("url=127.0.0.1/img/chan1 "))
    assertFalse("never the query string: $line", line.contains("path=") || line.contains("library") || line.contains("w=320"))
  }

  @Test fun aTricklingBodyFallsUnderTheThroughputFloorAsAFailure() {
    // Headers at once, then one byte every 150 ms: each read is under the 300 ms read timeout, so only the floor
    // (64 B per 400 ms window here) can end it.
    val url = server { s ->
      val out = s.getOutputStream()
      out.write("HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nContent-Length: 1000\r\n\r\n".toByteArray())
      out.flush()
      repeat(1000) {
        out.write(0x41)
        out.flush()
        Thread.sleep(150)
      }
    }
    val b = build(fast())
    val call = b.client.newCall(Request.Builder().url("$url/img/42").build())
    val t0 = System.nanoTime()
    try {
      call.execute().use { it.body!!.bytes() }
      fail("expected the throughput floor")
    } catch (e: ImageDeadlineException) {
      assertEquals("slow-body", e.kind)
    }
    val took = (System.nanoTime() - t0) / 1_000_000
    assertTrue("took ${took}ms", took in 350..2_500)
    assertFalse(call.isCanceled())
    assertEquals(1, b.failures.total)
    assertTrue(logs.toString(), failLines().single().startsWith("fail kind=slow-body"))
  }

  @Test fun aSlowButSteadyBodyOutlastsEveryFixedLimitAndCompletes() {
    // A big image over a slow link: 20 KB/s for 1.5 s. That is longer than the read timeout (300 ms) and the headers
    // deadline (800 ms) and a multiple of the window, yet far above the floor and under the backstop: it must load.
    val url = steadyBody(chunks = 30, chunkBytes = 1_000, everyMs = 50)
    val b = build(fast())
    val call = b.client.newCall(Request.Builder().url("$url/img/backdrop").build())
    val t0 = System.nanoTime()
    val bytes = call.execute().use { it.body!!.bytes() }
    val took = (System.nanoTime() - t0) / 1_000_000
    assertEquals(30_000, bytes.size)
    assertTrue("took ${took}ms", took > 1_000)
    assertEquals(0, b.failures.total)
    assertTrue(logs.toString(), failLines().isEmpty())
  }

  @Test fun aSteadyBodyStillStopsAtTheAbsoluteBackstop() {
    // 2 KB every 50 ms (far above the floor) for 3 s, against a 1 s backstop.
    val url = steadyBody(chunks = 60, chunkBytes = 2_000, everyMs = 50)
    val b = build(fast().copy(maxCallMs = 1_000))
    val call = b.client.newCall(Request.Builder().url("$url/img/huge").build())
    val t0 = System.nanoTime()
    try {
      call.execute().use { it.body!!.bytes() }
      fail("expected the backstop")
    } catch (e: ImageDeadlineException) {
      assertEquals("max-call", e.kind)
    }
    val took = (System.nanoTime() - t0) / 1_000_000
    assertTrue("took ${took}ms", took in 900..2_500)
    assertFalse(call.isCanceled())
    assertTrue(logs.toString(), failLines().single().startsWith("fail kind=max-call"))
  }

  @Test fun aBodyThatFinishesInALateThinWindowIsNotFailed() {
    // 5 bytes, a 500 ms pause (past the 400 ms window), the last 5: the window holds only 10 B (under the 64 B floor),
    // but that read completed the body (Content-Length), so it is a success, not a slow body.
    val url = server { s ->
      val out = s.getOutputStream()
      out.write("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 10\r\n\r\nAAAAA".toByteArray())
      out.flush()
      Thread.sleep(500)
      out.write("BBBBB".toByteArray())
      out.flush()
    }
    val b = build(fast().copy(readTimeoutMs = 2_000))
    val bytes = b.client.newCall(Request.Builder().url("$url/img/logo").build()).execute().use { it.body!!.bytes() }
    assertEquals("AAAAABBBBB", String(bytes))
    assertEquals(0, b.failures.total)
  }

  @Test fun headersDribbledInPastTheHeadersDeadlineFail() {
    // A status line, then a long header one byte every 100 ms (under the 300 ms read timeout) for ~1.5 s, against the
    // 800 ms headers deadline.
    val url = server { s ->
      val out = s.getOutputStream()
      out.write("HTTP/1.1 200 OK\r\nX-Slow: ".toByteArray())
      out.flush()
      repeat(15) {
        out.write(0x61)
        out.flush()
        Thread.sleep(100)
      }
      out.write("\r\nContent-Length: 0\r\n\r\n".toByteArray())
      out.flush()
    }
    val b = build(fast())
    val call = b.client.newCall(Request.Builder().url("$url/img/7").build())
    try {
      call.execute().close()
      fail("expected the headers deadline")
    } catch (e: ImageDeadlineException) {
      assertEquals("headers-deadline", e.kind)
    }
    assertFalse(call.isCanceled())
    // Thrown from the interceptor, so OkHttp's own failure event must not log it a second time.
    assertTrue(logs.toString(), failLines().single().startsWith("fail kind=headers-deadline"))
  }

  @Test fun headersDribbledForeverAreCutAtTheDeadlineAndFailTheCallLikeAnyTimeout() {
    // A status line, then a header one byte at a time for as long as the connection lives: every read is inside the 300 ms read
    // timeout, so neither it nor a check made only once the headers are in could ever end the call. Only the deadline can.
    val url = server { s ->
      val out = s.getOutputStream()
      out.write("HTTP/1.1 200 OK\r\nX-Slow: ".toByteArray())
      out.flush()
      while (true) {
        out.write(0x61)
        out.flush()
        Thread.sleep(100)
      }
    }
    val b = build(fast())
    val done = CountDownLatch(1)
    var failure: IOException? = null
    var cancelled: Boolean? = null
    val t0 = System.nanoTime()
    b.client.newCall(Request.Builder().url("$url/img/forever").build()).enqueue(
      object : Callback {
        override fun onFailure(call: Call, e: IOException) {
          failure = e
          cancelled = call.isCanceled()
          done.countDown()
        }

        override fun onResponse(call: Call, response: Response) {
          response.close()
          done.countDown()
        }
      },
    )
    assertTrue("the call was never ended", done.await(5, TimeUnit.SECONDS))
    val tookMs = (System.nanoTime() - t0) / 1_000_000
    assertTrue("ended after ${tookMs}ms: the 800 ms deadline", tookMs in 700..2_000)
    assertTrue(failure.toString(), failure is ImageDeadlineException)
    assertEquals("headers-deadline", (failure as ImageDeadlineException).kind)
    assertEquals("Fresco reports a cancelled call as cancelled, which never finishes the image", false, cancelled)
    assertTrue("a SocketTimeoutException, like every other timeout", failure is SocketTimeoutException)
    // The Dispatcher slot is free again, and the failure is logged once.
    assertEquals(0, b.client.dispatcher.runningCallsCount())
    assertTrue(logs.toString(), failLines().single().startsWith("fail kind=headers-deadline"))
  }

  @Test fun aCallThatGetsItsHeadersLeavesNoDeadlineWaiting() {
    val url = steadyBody(chunks = 2, chunkBytes = 5, everyMs = 20)
    val b = build(fast())
    b.client.newCall(Request.Builder().url("$url/img/ok").build()).execute().use { it.body!!.bytes() }
    assertEquals(0, ImageNet.pendingDeadlines())
    assertEquals(0, b.failures.total)
  }

  @Test fun aCallThatFailsInAnyWayLeavesNoDeadlineWaiting() {
    // Below the watchdog, so its proceed() throws something that is not an IOException: the deadline must still be disarmed.
    val url = steadyBody(chunks = 2, chunkBytes = 5, everyMs = 20)
    val c = build(fast()).client.newBuilder().addNetworkInterceptor(Interceptor { throw IllegalStateException("boom") }).build()
    try {
      c.newCall(Request.Builder().url("$url/img/boom").build()).execute().close()
      fail("expected the failure")
    } catch (e: IllegalStateException) {
      // expected
    }
    assertEquals(0, ImageNet.pendingDeadlines())
  }

  @Test fun aCloseThatBlocksDoesNotHoldUpAnotherDeadline() {
    // A TLS socket's close can block. The watchdog thread only hands the close on, so a close that never returns holds up nothing else.
    val release = CountDownLatch(1)
    val stuck = object : java.net.Socket() {
      override fun close() {
        release.await(5, TimeUnit.SECONDS)
      }
    }
    val other = CountDownLatch(1)
    ImageNet.schedule(20) { ImageNet.closeOffThread(stuck) }
    ImageNet.schedule(150) { other.countDown() }
    assertTrue("the second deadline never fired: the first close held the watchdog", other.await(2, TimeUnit.SECONDS))
    release.countDown()
  }

  /** One keep-alive server that answers every request with "ok", counting the connections it accepted. */
  private fun keepAliveServer(accepted: AtomicInteger): String {
    val ss = ServerSocket(0, 50, InetAddress.getLoopbackAddress())
    servers += ss
    Thread {
      while (!ss.isClosed) {
        val s = runCatching { ss.accept() }.getOrNull() ?: break
        sockets += s
        accepted.incrementAndGet()
        Thread {
          runCatching {
            val input = s.getInputStream().bufferedReader()
            val out = s.getOutputStream()
            while (true) {
              var line = input.readLine() ?: break
              while (line.isNotEmpty()) line = input.readLine() ?: break
              out.write("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 2\r\n\r\nok".toByteArray())
              out.flush()
            }
          }
        }.apply { isDaemon = true }.start()
      }
    }.apply { isDaemon = true }.start()
    return "http://127.0.0.1:${ss.localPort}"
  }

  /**
   * Sockets whose `close()` hangs when it is the deadline's closer thread that calls it, as closing a TLS socket can (the close_notify, the lock the
   * reader holds); a close from any other thread, as OkHttp's own of the raw socket when it detaches an exchange, goes through.
   */
  private class HangingSockets {
    val hang = AtomicBoolean(true)
    val release = CountDownLatch(1)
    val closeStarted = CountDownLatch(1)
    /** The threads that tried to close one, in order. */
    val closers: MutableList<Thread> = Collections.synchronizedList(mutableListOf())

    inner class HangingSocket : Socket() {
      override fun close() {
        closers += Thread.currentThread()
        if (hang.get() && Thread.currentThread().name == "AirwaveImgClose") {
          closeStarted.countDown()
          release.await(5, TimeUnit.SECONDS)
        }
        super.close()
      }
    }

    val factory = object : javax.net.SocketFactory() {
      override fun createSocket(): Socket = HangingSocket()
      override fun createSocket(host: String?, port: Int): Socket = throw UnsupportedOperationException()
      override fun createSocket(host: String?, port: Int, localHost: InetAddress?, localPort: Int): Socket = throw UnsupportedOperationException()
      override fun createSocket(host: InetAddress?, port: Int): Socket = throw UnsupportedOperationException()
      override fun createSocket(address: InetAddress?, port: Int, localAddress: InetAddress?, localPort: Int): Socket = throw UnsupportedOperationException()
    }
  }

  @Test fun aDeadlineThatFiresAsTheHeadersArriveNeitherBlocksTheCallNorLeavesAConnectionToReuse() {
    // Real OkHttp, a keep-alive server, and sockets whose close hangs. An interceptor inside the watchdog holds the response (already received) past the
    // deadline, so the deadline fires while the headers are in: the race. The close is on its own thread and stuck, so this thread must neither wait
    // for it nor leave the connection to the pool for the next call to take while it is open and about to be closed.
    val accepted = AtomicInteger()
    val url = keepAliveServer(accepted)
    val hanging = HangingSockets()
    val b = ImageNet.build(OkHttpClient.Builder().socketFactory(hanging.factory), fast().copy(headersDeadlineMs = 200)) { logs += it }
    val held = b.client.newBuilder().addNetworkInterceptor(Interceptor { chain -> chain.proceed(chain.request()).also { Thread.sleep(500) } }).build()
    val t0 = System.nanoTime()
    try {
      held.newCall(Request.Builder().url("$url/img/race").build()).execute().close()
      fail("expected the headers deadline")
    } catch (e: ImageDeadlineException) {
      assertEquals("headers-deadline", e.kind)
    }
    val tookMs = (System.nanoTime() - t0) / 1_000_000
    assertTrue("the call waited for the stuck close: ${tookMs}ms", tookMs < 2_500)
    assertTrue("the deadline's close was under way", hanging.closeStarted.await(2, TimeUnit.SECONDS))
    // The deadline's close is still stuck; the next call must not be handed the connection it is closing: it opens one of its own and is served.
    b.client.newCall(Request.Builder().url("$url/img/next").build()).execute().use { assertEquals("ok", it.body!!.string()) }
    assertEquals("the next call took a connection of its own", 2, accepted.get())
    hanging.release.countDown()
  }

  @Test fun aDeadlineThatFiresAsTheHeadersArriveFailsTheCallWithoutClosingAnythingOnTheCallThread() {
    // The watchdog's chain with a hand-made response: the deadline (0 ms) fires while proceed() is still going, its close hangs on the closer thread,
    // and the response then arrives. The call thread must fail the call at once, closing neither the socket (a second closer would wait behind the
    // first) nor the response (which would pool its connection).
    val release = CountDownLatch(1)
    val closeStarted = CountDownLatch(1)
    val closers: MutableList<Thread> = Collections.synchronizedList(mutableListOf())
    val responseClosed = AtomicBoolean(false)
    val sock = object : java.net.Socket() {
      override fun close() {
        closers += Thread.currentThread()
        closeStarted.countDown()
        release.await(5, TimeUnit.SECONDS)
      }
    }
    val request = Request.Builder().url("http://127.0.0.1/img/race").build()
    val connection = object : Connection {
      override fun route() = throw UnsupportedOperationException()
      override fun socket() = sock
      override fun handshake() = null
      override fun protocol() = Protocol.HTTP_1_1
    }
    val body = object : ResponseBody() {
      private val source = Buffer().writeUtf8("x")
      override fun contentType(): MediaType? = null
      override fun contentLength() = 1L
      override fun source(): BufferedSource = source
      override fun close() {
        responseClosed.set(true)
      }
    }
    val response = Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK").body(body).build()
    val call = OkHttpClient().newCall(request)
    val chain = object : Interceptor.Chain {
      override fun request() = request
      override fun proceed(request: Request): Response {
        Thread.sleep(150) // the headers take their time: the deadline (0 ms) fires meanwhile
        return response
      }
      override fun connection() = connection
      override fun call() = call
      override fun connectTimeoutMillis() = 1000
      override fun withConnectTimeout(timeout: Int, unit: TimeUnit): Interceptor.Chain = this
      override fun readTimeoutMillis() = 1000
      override fun withReadTimeout(timeout: Int, unit: TimeUnit): Interceptor.Chain = this
      override fun writeTimeoutMillis() = 1000
      override fun withWriteTimeout(timeout: Int, unit: TimeUnit): Interceptor.Chain = this
    }
    val watchdog = HeadersWatchdog(fast().copy(headersDeadlineMs = 0), FailureLog(log = { logs += it }))
    val t0 = System.nanoTime()
    try {
      watchdog.intercept(chain)
      fail("expected the headers deadline")
    } catch (e: ImageDeadlineException) {
      assertEquals("headers-deadline", e.kind)
    }
    assertTrue("the call waited for the close: ${(System.nanoTime() - t0) / 1_000_000}ms", (System.nanoTime() - t0) / 1_000_000 < 2_000)
    assertTrue("the deadline's close is under way, and stuck", closeStarted.await(2, TimeUnit.SECONDS))
    assertFalse("the call thread did not close the socket", closers.contains(Thread.currentThread()))
    assertEquals("one closer", 1, closers.size)
    assertFalse("the response is left to OkHttp, which would pool its connection if it were closed here", responseClosed.get())
    release.countDown()
  }

  private fun listenerLine(events: (FailureListener, Call) -> Unit): String {
    val lines = mutableListOf<String>()
    val listener = FailureListener(FailureLog(log = { lines += it }))
    events(listener, OkHttpClient().newCall(Request.Builder().url("http://127.0.0.1/img/1").build()))
    return lines.single()
  }

  private val address = InetSocketAddress.createUnresolved("127.0.0.1", 1)

  @Test fun aConnectThatTimesOutIsLoggedAsAConnectTimeoutEvenThoughConnectFailedComesFirst() {
    // OkHttp's own order for a connect (or TLS handshake) that times out: connectStart, connectFailed, then callFailed.
    val line = listenerLine { l, call ->
      l.connectStart(call, address, Proxy.NO_PROXY)
      l.connectFailed(call, address, Proxy.NO_PROXY, null, SocketTimeoutException("connect timed out"))
      l.callFailed(call, SocketTimeoutException("connect timed out"))
    }
    assertTrue(line, line.startsWith("fail kind=connect-timeout"))
  }

  @Test fun aReadTimeoutAfterARetriedConnectIsAReadTimeout() {
    // The first address timed out, the next connected, and then the read timed out: it is the read's.
    val line = listenerLine { l, call ->
      l.connectStart(call, address, Proxy.NO_PROXY)
      l.connectFailed(call, address, Proxy.NO_PROXY, null, SocketTimeoutException("connect timed out"))
      l.connectStart(call, address, Proxy.NO_PROXY)
      l.connectEnd(call, address, Proxy.NO_PROXY, Protocol.HTTP_1_1)
      l.callFailed(call, SocketTimeoutException("timeout"))
    }
    assertTrue(line, line.startsWith("fail kind=read-timeout"))
  }

  @Test fun aTimeoutAfterAConnectThatFailedForAnotherReasonIsNotAConnectTimeout() {
    val line = listenerLine { l, call ->
      l.connectStart(call, address, Proxy.NO_PROXY)
      l.connectFailed(call, address, Proxy.NO_PROXY, null, IOException("refused"))
      l.callFailed(call, SocketTimeoutException("timeout"))
    }
    assertTrue(line, line.startsWith("fail kind=read-timeout"))
  }

  @Test fun aTimeoutOnAConnectionThatWasMadeOrPooledIsAReadTimeout() {
    val made = listenerLine { l, call ->
      l.connectStart(call, address, Proxy.NO_PROXY)
      l.connectEnd(call, address, Proxy.NO_PROXY, Protocol.HTTP_1_1)
      l.callFailed(call, SocketTimeoutException("timeout"))
    }
    val pooled = listenerLine { l, call -> l.callFailed(call, SocketTimeoutException("timeout")) } // no connect at all
    assertTrue(made, made.startsWith("fail kind=read-timeout"))
    assertTrue(pooled, pooled.startsWith("fail kind=read-timeout"))
  }

  @Test fun aTimeoutWhileConnectingIsAConnectTimeout() {
    val line = listenerLine { l, call ->
      l.connectStart(call, address, Proxy.NO_PROXY)
      l.callFailed(call, SocketTimeoutException("timeout")) // the connect is still going as the call fails
    }
    assertTrue(line, line.startsWith("fail kind=connect-timeout"))
  }

  @Test fun aRealConnectTimeoutIsLoggedAsOneByTheClient() {
    // Real OkHttp: sockets whose connect times out. Whatever order its events come in, the line says connect-timeout.
    val factory = object : javax.net.SocketFactory() {
      override fun createSocket(): Socket = object : Socket() {
        override fun connect(endpoint: java.net.SocketAddress?, timeout: Int) = throw SocketTimeoutException("connect timed out")
      }
      override fun createSocket(host: String?, port: Int): Socket = throw UnsupportedOperationException()
      override fun createSocket(host: String?, port: Int, localHost: InetAddress?, localPort: Int): Socket = throw UnsupportedOperationException()
      override fun createSocket(host: InetAddress?, port: Int): Socket = throw UnsupportedOperationException()
      override fun createSocket(address: InetAddress?, port: Int, localAddress: InetAddress?, localPort: Int): Socket = throw UnsupportedOperationException()
    }
    val b = ImageNet.build(OkHttpClient.Builder().socketFactory(factory), fast()) { logs += it }
    try {
      b.client.newCall(Request.Builder().url("http://127.0.0.1:9/img/1").build()).execute().close()
      fail("expected a connect timeout")
    } catch (e: SocketTimeoutException) {
      // expected
    }
    assertTrue(logs.toString(), failLines().single().startsWith("fail kind=connect-timeout"))
  }

  @Test fun asyncTimeoutReachesOnFailureWithTheCallNotCancelled() {
    // Fresco's OkHttpNetworkFetcher enqueues and routes onFailure to a failure only when !call.isCanceled().
    val url = server { Thread.sleep(10_000) }
    val b = build(fast())
    val done = CountDownLatch(1)
    var cancelled: Boolean? = null
    b.client.newCall(Request.Builder().url("$url/img/1").build()).enqueue(
      object : Callback {
        override fun onFailure(call: Call, e: IOException) {
          cancelled = call.isCanceled()
          done.countDown()
        }

        override fun onResponse(call: Call, response: Response) {
          response.close()
          done.countDown()
        }
      },
    )
    assertTrue(done.await(5, TimeUnit.SECONDS))
    assertEquals(false, cancelled)
  }

  @Test fun okHttpsOwnCallTimeoutWouldCancelWhichIsWhyItIsNotUsed() {
    // The trap ImageNet avoids: OkHttp's callTimeout ends the call by cancelling it, and Fresco's OkHttpNetworkFetcher
    // turns a cancelled call into onCancellation(), so a still-subscribed image would never finish or retry.
    val url = server { Thread.sleep(10_000) }
    val c = OkHttpClient.Builder().callTimeout(300, TimeUnit.MILLISECONDS).build()
    val call = c.newCall(Request.Builder().url("$url/img/1").build())
    runCatching { call.execute().close() }
    assertTrue(call.isCanceled())
  }

  @Test fun cancellationsAreNotLogged() {
    val url = server { Thread.sleep(10_000) }
    val b = build(ImageNet.Settings())
    val call = b.client.newCall(Request.Builder().url("$url/img/1").build())
    Thread {
      Thread.sleep(200)
      call.cancel()
    }.start()
    runCatching { call.execute().close() }
    assertTrue(call.isCanceled())
    assertEquals(0, b.failures.total)
    assertTrue(failLines().isEmpty())
  }

  @Test fun describeDropsQueryAndTruncatesLongPaths() {
    val u = okhttp3.HttpUrl.Builder().scheme("http").host("10.0.0.5").addPathSegments("img/" + "a".repeat(80)).query("token=abc").build()
    val d = ImageNet.describe(u)
    assertTrue(d, d.startsWith("10.0.0.5/img/aaa"))
    assertTrue(d, d.endsWith("..."))
    assertFalse(d, d.contains("token"))
  }

  @Test fun failureLogCapsBurstsAndCountsTheHeldBack() {
    val l = FailureLog({ logs += it }, maxLines = 3, windowMs = 10_000)
    assertEquals(0, l.allow(0))
    assertEquals(0, l.allow(1))
    assertEquals(0, l.allow(2))
    assertNull(l.allow(3))
    assertNull(l.allow(4))
    // A new window: the next line says how many were held back.
    assertEquals(2, l.allow(10_000))
    assertEquals(0, l.allow(10_001))
  }

  @Test fun everyFailureIsCountedButOnlyTheFirstFewAreLogged() {
    val l = FailureLog({ logs += it }, maxLines = 2, windowMs = 60_000)
    val url = okhttp3.HttpUrl.Builder().scheme("http").host("h").addPathSegments("img/1").build()
    repeat(5) { l.failed("io", url, 12, IOException("boom")) }
    assertEquals(5, l.total)
    assertEquals(logs.toString(), 2, failLines().size)
    assertTrue(logs.toString(), failLines()[1].contains("failures=2"))
  }
}
