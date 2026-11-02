package expo.modules.nativeguide

import android.util.Log
import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketTimeoutException
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import okhttp3.Call
import okhttp3.ConnectionPool
import okhttp3.Dispatcher
import okhttp3.EventListener
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.asResponseBody
import okio.Buffer
import okio.ForwardingSource
import okio.buffer

/**
 * The image pipeline's own OkHttp client (what Fresco fetches with: every React Native `<Image>` and the native guide's
 * images). It is built from React Native's client builder, so it keeps that builder's cookie jar container, which is empty
 * until a jar is set (the config plugin sets the forwarding jar, as React Native's own Fresco config does). It is a separate
 * client from the shared one, so `fetch()` and WebSocket keep their own settings. What changes:
 *
 *  - Bounded timeouts. The builder's connect/read/write timeouts are 0 (infinite), so one TCP connection that stalls
 *    mid-body held its Dispatcher slot until the kernel gave up. Now connect 4 s, read 6 s.
 *  - Progress limits on top, enforced by interceptors that throw [ImageDeadlineException]: response headers within
 *    12 s of the call starting to execute (Dispatcher queueing doesn't count); then a throughput floor on the body of
 *    16 KiB per 8 s window; and a 60 s backstop per call. A big image that keeps arriving over a slow link is never
 *    cut off by a fixed total, while a trickle fails within about one window. A body that stops dead is the read
 *    timeout's job. The headers deadline is enforced while the headers are still arriving ([HeadersWatchdog]), not only
 *    once they have, so a server that dribbles its response head cannot hold a call for as long as it likes.
 *  - A wider Dispatcher: 8 calls per host (OkHttp's default is 5, and every guide image comes from one server), 24 in all.
 *  - A connection pool with a 30 s keep-alive, well under the server's idle timeout, so a pooled connection is dropped
 *    here before the server closes it underneath us.
 *
 * The limits throw a [SocketTimeoutException] instead of using OkHttp's `callTimeout`. That one cancels the call, and
 * Fresco's OkHttpNetworkFetcher reports a cancelled call as onCancellation(), not onFailure(). A DataSource still
 * subscribed then never finishes, so the image sits on its placeholder forever and no retry runs. A timeout is a plain
 * failure, so the callers' retry paths work.
 *
 * Logging ([TAG], through android.util.Log so it survives release builds): one line when the client is created, and one
 * line per failure, rate-limited, with the URL's host and path only, never its query string. Calls cancelled because
 * their image scrolled away are routine and not logged.
 */
object ImageNet {
  const val TAG = "AirwaveImg"

  /** The tuned values. Tests shorten the timeouts. */
  data class Settings(
    val connectTimeoutMs: Long = 4_000,
    val readTimeoutMs: Long = 6_000,
    val writeTimeoutMs: Long = 6_000,
    /** Response headers must arrive within this long of the call starting to execute. */
    val headersDeadlineMs: Long = 12_000,
    /** Body throughput floor: at least [minWindowBytes] in every [progressWindowMs] (16 KiB / 8 s = 2 KiB/s). */
    val progressWindowMs: Long = 8_000,
    val minWindowBytes: Long = 16L * 1024,
    /** Absolute backstop per call, however steadily it progresses. */
    val maxCallMs: Long = 60_000,
    val maxRequests: Int = 24,
    val maxRequestsPerHost: Int = 8,
    val maxIdleConnections: Int = 8,
    val keepAliveMs: Long = 30_000,
  )

  /** The client for Fresco: `OkHttpImagePipelineConfigFactory.newBuilder(app, ImageNet.client(OkHttpClientProvider.createClientBuilder()))`. */
  @JvmStatic
  fun client(base: OkHttpClient.Builder): OkHttpClient = build(base, Settings()) { Log.w(TAG, it) }.client

  internal class Built(val client: OkHttpClient, val failures: FailureLog)

  /** [client] with injectable settings and logger (JVM tests). */
  internal fun build(base: OkHttpClient.Builder, settings: Settings, log: (String) -> Unit): Built {
    val failures = FailureLog(log)
    val dispatcher = Dispatcher().apply {
      maxRequests = settings.maxRequests
      maxRequestsPerHost = settings.maxRequestsPerHost
    }
    val client = base
      .dispatcher(dispatcher)
      .connectionPool(ConnectionPool(settings.maxIdleConnections, settings.keepAliveMs, TimeUnit.MILLISECONDS))
      .connectTimeout(settings.connectTimeoutMs, TimeUnit.MILLISECONDS)
      .readTimeout(settings.readTimeoutMs, TimeUnit.MILLISECONDS)
      .writeTimeout(settings.writeTimeoutMs, TimeUnit.MILLISECONDS)
      .callTimeout(0, TimeUnit.MILLISECONDS) // see the class doc: a call timeout cancels, which Fresco never reports as a failure
      .retryOnConnectionFailure(true)
      .addInterceptor(DeadlineInterceptor(settings, failures))
      .addNetworkInterceptor(HeadersWatchdog(settings, failures))
      .eventListenerFactory(
        object : EventListener.Factory {
          override fun create(call: Call): EventListener = FailureListener(failures)
        },
      )
      .build()
    log(
      "client connect=${settings.connectTimeoutMs}ms read=${settings.readTimeoutMs}ms headers=${settings.headersDeadlineMs}ms " +
        "floor=${settings.minWindowBytes}B/${settings.progressWindowMs}ms maxCall=${settings.maxCallMs}ms " +
        "perHost=${settings.maxRequestsPerHost} max=${settings.maxRequests} keepAlive=${settings.keepAliveMs}ms",
    )
    return Built(client, failures)
  }

  /** `host/path` (path truncated), never the query. */
  @JvmStatic
  fun describe(url: HttpUrl): String {
    val path = url.encodedPath
    return url.host + (if (path.length > 48) path.take(45) + "..." else path)
  }

  internal fun now(): Long = System.nanoTime() / 1_000_000

  /** The one thread the [HeadersWatchdog] deadlines run on (created on first use; a cancelled task leaves its queue at once). */
  private val watchdog by lazy {
    ScheduledThreadPoolExecutor(1) { r -> Thread(r, "AirwaveImgWatchdog").apply { isDaemon = true } }.apply { removeOnCancelPolicy = true }
  }

  internal fun schedule(delayMs: Long, task: Runnable) = watchdog.schedule(task, delayMs, TimeUnit.MILLISECONDS)

  /** Where [HeadersWatchdog] closes sockets (created on first use, threads that end when idle). Not the watchdog's own thread: see [closeOffThread]. */
  private val closer by lazy {
    Executors.newCachedThreadPool { r -> Thread(r, "AirwaveImgClose").apply { isDaemon = true } }
  }

  /**
   * Closes `socket` on another thread. Closing a TLS socket can block (it sends a close_notify, and takes the lock the thread that is reading
   * from it holds), and the one watchdog thread serves every call's deadline: a close that blocked there would hold every other deadline up
   * with it. A close that blocks here holds up only itself. It is the only thing that closes the socket: [HeadersWatchdog] schedules it once.
   */
  internal fun closeOffThread(socket: java.net.Socket) {
    closer.execute { runCatching { socket.close() } }
  }
  /** Deadlines waiting to fire: 0 once every call has got its headers or failed. (JVM tests.) */
  internal fun pendingDeadlines(): Int = watchdog.queue.size
}

/** A call that broke one of the interceptor's limits. A SocketTimeoutException, so Fresco reports it as a failure.
 *  `kind`: "headers-deadline", "slow-body" (under the throughput floor) or "max-call" (the absolute backstop). */
class ImageDeadlineException(val kind: String, message: String) : SocketTimeoutException(message)

/**
 * Enforces the headers deadline WHILE the headers are still arriving. [DeadlineInterceptor] can only judge the headers once
 * `proceed()` has returned, and a server that dribbles its response head a byte at a time, each byte inside the read timeout,
 * never lets it return: the call and its Dispatcher slot are held for as long as the server cares to dribble.
 *
 * A network interceptor, so it has the connection. At the deadline it closes the connection's socket, which makes the blocked read
 * throw, and the call then fails with an [ImageDeadlineException] (a plain failure that Fresco retries). It does not `cancel()` the call:
 * Fresco reports a cancelled call as cancelled, never failed, and a subscribed image then never finishes (see [ImageNet]).
 *
 * HTTP/1.x only: there the read timeout restarts with every byte. HTTP/2 waits for a stream's headers under one read timeout
 * (which already bounds it, and closing the socket would take every other stream on the connection with it). The deadline runs
 * from the moment the request goes out on the connection (connecting has its own timeout).
 */
internal class HeadersWatchdog(private val settings: ImageNet.Settings, private val failures: FailureLog) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val connection = chain.connection()
    val socket = connection?.socket()
    val protocol = connection?.protocol()
    if (socket == null || (protocol != Protocol.HTTP_1_1 && protocol != Protocol.HTTP_1_0)) return chain.proceed(chain.request())

    val state = AtomicInteger(RUNNING)
    val start = ImageNet.now()
    // On the watchdog's thread this only decides, and hands the close to another thread (see [ImageNet.closeOffThread]). The compare-and-set makes it
    // happen once, and nothing else ever closes the socket: this thread, below, leaves it alone.
    val timer = ImageNet.schedule(settings.headersDeadlineMs) {
      if (state.compareAndSet(RUNNING, FIRED)) ImageNet.closeOffThread(socket)
    }
    val response = try {
      chain.proceed(chain.request())
    } catch (e: IOException) {
      if (state.get() == FIRED) throw late(chain, start)
      throw e
    } finally {
      timer.cancel(false) // whatever ends the call: a failure of any kind leaves no deadline armed
    }
    // The headers are in. If the deadline fired in the same instant, the socket is being closed under the response: fail it as the deadline.
    if (!state.compareAndSet(RUNNING, DONE)) {
      // The deadline fired, so the socket is being closed on the other thread, and may not be closed yet. Neither close it here (a second closer on a TLS
      // socket can block this thread behind the first) nor close the response: `response.close()` of a response that arrived whole hands its connection
      // back to the pool, where the next call could take it while it is open and about to be closed. Throwing with the response still open is what
      // OkHttp expects of an interceptor that fails a call: it detaches the exchange, which closes the RAW socket (a plain close that never waits on the
      // TLS layer) and so the connection is not reused, and it never blocks this thread.
      throw late(chain, start)
    }
    return response
  }

  private fun late(chain: Interceptor.Chain, start: Long): ImageDeadlineException {
    val age = ImageNet.now() - start
    val e = ImageDeadlineException("headers-deadline", "image headers not complete after ${age}ms (limit ${settings.headersDeadlineMs}ms)")
    failures.failed("headers-deadline", chain.call().request().url, age, e)
    return e
  }

  private companion object {
    const val RUNNING = 0
    const val FIRED = 1
    const val DONE = 2
  }
}

/**
 * Enforces the progress limits: headers within `headersDeadlineMs` of the call starting to execute; then, on the body,
 * at least `minWindowBytes` per `progressWindowMs` window (checked as each read returns data, so a body that has fully
 * arrived is never failed), and never past `maxCallMs`. A body that stops dead is bounded by the read timeout (each
 * read blocks at most that long).
 */
internal class DeadlineInterceptor(private val settings: ImageNet.Settings, private val failures: FailureLog) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val call = chain.call()
    val start = ImageNet.now()
    val response = chain.proceed(chain.request())
    val headersAt = ImageNet.now()
    if (headersAt - start > settings.headersDeadlineMs) {
      response.close()
      throw deadline(call, start, "headers-deadline", "image headers after ${headersAt - start}ms (limit ${settings.headersDeadlineMs}ms)")
    }
    val body = response.body ?: return response
    val contentLength = body.contentLength()
    val source = object : ForwardingSource(body.source()) {
      private var total = 0L
      private var windowStart = headersAt
      private var windowBytes = 0L

      override fun read(sink: Buffer, byteCount: Long): Long {
        val n = super.read(sink, byteCount)
        if (n <= 0) return n // EOF (or nothing): a finished body is never failed
        total += n
        if (contentLength in 0..total) return n // that was the last of it
        val now = ImageNet.now()
        if (now - start > settings.maxCallMs) {
          throw deadline(call, start, "max-call", "image call over ${settings.maxCallMs}ms (${total}B of ${contentLength}B)")
        }
        windowBytes += n
        if (now - windowStart >= settings.progressWindowMs) {
          if (windowBytes < settings.minWindowBytes) {
            throw deadline(
              call, start, "slow-body",
              "image body ${windowBytes}B in ${now - windowStart}ms (floor ${settings.minWindowBytes}B/${settings.progressWindowMs}ms)",
            )
          }
          windowStart = now
          windowBytes = 0
        }
        return n
      }
    }
    return response.newBuilder().body(source.buffer().asResponseBody(body.contentType(), contentLength)).build()
  }

  /** Logged here, not by [FailureListener]: OkHttp never sees a failure thrown from a body read, so it fires no event. */
  private fun deadline(call: Call, start: Long, kind: String, message: String): ImageDeadlineException {
    val e = ImageDeadlineException(kind, message)
    failures.failed(kind, call.request().url, ImageNet.now() - start, e)
    return e
  }
}

/** Logs the failures OkHttp reports itself (connect and read timeouts, resets, DNS). Our own deadlines are logged by
 *  the interceptor, and a cancelled call (an image that scrolled away) is not a failure. One instance per call. */
internal class FailureListener(private val failures: FailureLog) : EventListener() {
  private val createdAt = ImageNet.now()

  /** A connect attempt is under way: started, and not yet ended or failed. */
  @Volatile private var connecting = false

  /**
   * The latest connect attempt failed with a timeout and none has started since. OkHttp reports a connect that timed out (or whose TLS handshake did)
   * with `connectFailed` BEFORE it fails the call with `callFailed`, so by then `connecting` is already false: this is what says the call's timeout is
   * that one. A later attempt (the call goes on to another address) or an ended one (`connectEnd`) means a timeout after it is a read's.
   */
  @Volatile private var connectTimedOut = false

  override fun connectStart(call: Call, inetSocketAddress: java.net.InetSocketAddress, proxy: java.net.Proxy) {
    connecting = true
    connectTimedOut = false
  }

  override fun connectEnd(call: Call, inetSocketAddress: java.net.InetSocketAddress, proxy: java.net.Proxy, protocol: okhttp3.Protocol?) {
    connecting = false
    connectTimedOut = false
  }

  /** A connect that failed is over too: a timeout later in the call (a pooled connection, say) is not its, unless the failure was itself a timeout (see [connectTimedOut]). */
  override fun connectFailed(call: Call, inetSocketAddress: java.net.InetSocketAddress, proxy: java.net.Proxy, protocol: okhttp3.Protocol?, ioe: IOException) {
    connecting = false
    connectTimedOut = ioe is SocketTimeoutException
  }

  override fun callFailed(call: Call, ioe: IOException) {
    if (call.isCanceled() || ioe is ImageDeadlineException) return
    val kind = when {
      ioe is SocketTimeoutException && (connecting || connectTimedOut) -> "connect-timeout"
      ioe is SocketTimeoutException -> "read-timeout"
      ioe is InterruptedIOException -> "interrupted"
      else -> "io"
    }
    failures.failed(kind, call.request().url, ImageNet.now() - createdAt, ioe)
  }
}

/** Counts every failure but writes at most [maxLines] log lines per [windowMs]; a line says how many were held back. */
internal class FailureLog(
  private val log: (String) -> Unit,
  private val maxLines: Int = 10,
  private val windowMs: Long = 10_000,
) {
  private val count = AtomicInteger()
  private var windowStart = Long.MIN_VALUE
  private var lines = 0
  private var dropped = 0

  val total: Int get() = count.get()

  fun failed(kind: String, url: HttpUrl, ageMs: Long, e: IOException) {
    val n = count.incrementAndGet()
    val held = allow(ImageNet.now()) ?: return
    log(
      "fail kind=$kind url=${ImageNet.describe(url)} age=${ageMs}ms failures=$n" +
        (if (held > 0) " (+$held not logged)" else "") +
        " err=${e.javaClass.simpleName}: ${(e.message ?: "").take(80)}",
    )
  }

  /** The number of lines held back since the last logged one, or null when this one is over the limit. */
  @Synchronized
  fun allow(now: Long): Int? {
    if (windowStart == Long.MIN_VALUE || now - windowStart >= windowMs) {
      windowStart = now
      lines = 0
    }
    if (lines >= maxLines) {
      dropped += 1
      return null
    }
    lines += 1
    return dropped.also { dropped = 0 }
  }
}
