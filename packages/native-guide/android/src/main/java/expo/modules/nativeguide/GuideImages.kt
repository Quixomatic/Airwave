package expo.modules.nativeguide

import android.graphics.Bitmap
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.facebook.common.executors.UiThreadImmediateExecutorService
import com.facebook.common.references.CloseableReference
import com.facebook.datasource.BaseDataSubscriber
import com.facebook.datasource.DataSource
import com.facebook.drawee.backends.pipeline.Fresco
import com.facebook.imagepipeline.common.ImageDecodeOptions
import com.facebook.imagepipeline.common.ResizeOptions
import com.facebook.imagepipeline.image.CloseableBitmap
import com.facebook.imagepipeline.image.CloseableImage
import com.facebook.imagepipeline.request.ImageRequestBuilder

/**
 * The native rows' images, through the app's own image pipeline (Fresco, the same one every React Native <Image>
 * uses, with its network stack, disk cache and memory cache), so an image the app already fetched is shared, never
 * fetched twice, and every decoded bitmap is accounted for in ONE memory cache.
 *
 * This class only holds REFERENCES to the bitmaps it is drawing (or drew recently), bounded by `budgetBytes`: a
 * reference that falls out of the budget (least recently drawn first, never one drawn this frame) is closed, which
 * hands the bitmap back to Fresco's own cache (and its own eviction). Everything is released when the view detaches.
 *
 * Behavior mirrors a React Native <Image>: a fresh fetch fades in over 300 ms (a memory-cache hit draws at once), and
 * a failed fetch is retried 3 times, 1 s / 2 s / 4 s apart, before the caller gets `failed` (the caller then draws
 * its fallback). A failure is forgotten after FAILURE_TTL_MS, so a server blip doesn't blank images until the app
 * restarts. A fetch that has made NO PROGRESS for STUCK_MS (no bytes yet, or none lately; Fresco reports download
 * progress per chunk) is abandoned and counted as a failure, so no image can sit on its placeholder for good whatever
 * happens underneath; a slow download that keeps moving is never abandoned. Main thread only.
 */
class GuideImages(private val onChanged: () -> Unit) {
  class Entry internal constructor(val key: String, val url: String, internal val resizeW: Int, internal val resizeH: Int) {
    internal var ref: CloseableReference<CloseableImage>? = null
    var bitmap: Bitmap? = null
      internal set
    internal var source: DataSource<CloseableReference<CloseableImage>>? = null

    /** Uptime (ms) the bitmap arrived from a fresh fetch; 0 = a memory-cache hit (no fade). */
    var arrivedAt = 0L
      internal set
    var failed = false
      internal set
    internal var failedAt = 0L
    internal var attempts = 0
    internal var retryAt = 0L

    /** Uptime (ms) of the in-flight fetch's last sign of life: its start, or its latest download progress. */
    internal var activeAt = 0L
    internal var usedFrame = 0L
    internal val bytes: Int get() = bitmap?.allocationByteCount ?: 0

    /** Still loading (or waiting to retry): the caller draws its placeholder. */
    val loading: Boolean get() = bitmap == null && !failed
  }

  companion object {
    const val FADE_MS = 300L
    private const val RETRY_LIMIT = 3
    private const val RETRY_BASE_MS = 1000L
    private const val FAILURE_TTL_MS = 5 * 60_000L

    /** No progress for this long = abandoned. It has to outlast queueing behind the network client's per-host limit
     *  on a slow link (queue time can't be told apart from a hang here: the first progress only comes with the first
     *  bytes), so it is a backstop for a fetch whose callback never comes, not a network timeout. */
    internal const val STUCK_MS = 90_000L
    private const val CALLER = "AirwaveGuide"
  }

  /** How many bytes of decoded bitmaps this view may keep referenced (see [imageBudgetBytes]). */
  var budgetBytes = imageBudgetBytes(0)
  private val entries = LinkedHashMap<String, Entry>(64, 0.75f, true)
  private var heldBytes = 0L
  private var frame = 0L
  private val main = Handler(Looper.getMainLooper())
  private val wake = RetryWake()
  private val retryTick = Runnable {
    wake.fired()
    onChanged()
  }

  /** Moves whenever what drawing an image would show changes: one arrived, one failed for good, or one was let go. A row that drew an image
   *  is drawn again when it has moved (see [RowRecordings]). */
  var version = 0L
    private set

  /** While it is set, [get] also lists each entry it hands out in it: that is how a row's recording learns which images it drew. */
  var collector: MutableList<Entry>? = null

  fun beginFrame() {
    frame += 1
  }

  /** Marks `list` (the entries a row's recording drew) as in use this frame, as drawing the row again would have, so a row drawn from its
   *  recording keeps its images from being let go or its fetches from being cancelled. */
  fun touch(list: List<Entry>) {
    for (e in list) e.usedFrame = frame
  }

  /** The image for `url`. `resizeW` and `resizeH` above 0 decode it down to that pixel box (like React Native's
   *  `resizeMethod="resize"`); 0 decodes it as served (server-sized art). Starts or retries the fetch as needed. */
  fun get(url: String, resizeW: Int = 0, resizeH: Int = 0): Entry {
    val key = if (resizeW > 0) "$url#${resizeW}x$resizeH" else url
    val e = entries[key] ?: Entry(key, url, resizeW, resizeH).also { entries[key] = it }
    e.usedFrame = frame
    val now = SystemClock.uptimeMillis()
    if (e.failed && now - e.failedAt > FAILURE_TTL_MS) {
      e.failed = false
      e.attempts = 0
      e.retryAt = 0
      version += 1
    }
    if (e.bitmap == null && e.source == null && !e.failed) {
      if (now >= e.retryAt) start(e) else scheduleRetry(e.retryAt - now)
    } else if (e.source != null) {
      // In flight: abandon it if it has shown no progress for far longer than the network allows; else check back
      // then (a progress update in the meantime just moves the check later).
      if (now - e.activeAt >= STUCK_MS) {
        e.source?.close()
        e.source = null
        fail(e)
      } else {
        scheduleRetry(e.activeAt + STUCK_MS - now)
      }
    }
    collector?.add(e)
    return e
  }

  /** After a frame: closes the references over budget (least recently drawn first, never one drawn this frame) and
   *  cancels fetches for images that left the screen. */
  fun endFrame() {
    val now = SystemClock.uptimeMillis()
    val it = entries.values.iterator()
    while (it.hasNext()) {
      val e = it.next()
      if (e.usedFrame == frame) continue
      when {
        // Scrolled away mid-fetch (or while waiting to retry): cancel; Fresco keeps whatever it already has cached.
        e.bitmap == null && !e.failed -> {
          release(e)
          it.remove()
        }
        // A remembered failure (no bitmap, no bytes) is kept until it expires, so an image that failed shows its
        // fallback straight away when its row scrolls back instead of retrying from scratch.
        e.failed -> if (now - e.failedAt > FAILURE_TTL_MS) it.remove()
        heldBytes > budgetBytes -> {
          release(e)
          it.remove()
        }
      }
    }
  }

  /** Memory pressure: drop every reference not drawn in the latest frame. */
  fun trim() {
    val it = entries.values.iterator()
    while (it.hasNext()) {
      val e = it.next()
      if (e.usedFrame == frame) continue
      release(e)
      it.remove()
    }
  }

  /** Releases everything (the view detached). */
  fun clear() {
    for (e in entries.values) release(e)
    entries.clear()
    heldBytes = 0
    main.removeCallbacks(retryTick)
    wake.reset()
  }

  private fun release(e: Entry) {
    if (e.bitmap != null) version += 1
    e.source?.close()
    e.source = null
    heldBytes -= e.bytes
    e.bitmap = null
    CloseableReference.closeSafely(e.ref)
    e.ref = null
  }

  /** Wakes the view (one shared Runnable) when the EARLIEST pending retry/check is due. */
  private fun scheduleRetry(delayMs: Long) {
    val d = wake.request(SystemClock.uptimeMillis(), delayMs)
    if (d < 0) return
    main.removeCallbacks(retryTick)
    main.postDelayed(retryTick, d)
  }

  private fun start(e: Entry) {
    if (!Fresco.hasBeenInitialized()) {
      // React Native initializes Fresco with its own network stack; never initialize it here. Try again shortly.
      scheduleRetry(250)
      return
    }
    val pipeline = Fresco.getImagePipeline()
    val b = ImageRequestBuilder.newBuilderWithSource(Uri.parse(e.url))
      .setImageDecodeOptions(ImageDecodeOptions.newBuilder().setForceStaticImage(true).build())
    if (e.resizeW > 0 && e.resizeH > 0) b.setResizeOptions(ResizeOptions(e.resizeW, e.resizeH))
    val request = b.build()
    val fromMemory = pipeline.isInBitmapMemoryCache(request)
    val ds = pipeline.fetchDecodedImage(request, CALLER)
    e.source = ds
    e.activeAt = SystemClock.uptimeMillis()
    ds.subscribe(
      object : BaseDataSubscriber<CloseableReference<CloseableImage>>() {
        override fun onNewResultImpl(dataSource: DataSource<CloseableReference<CloseableImage>>) {
          if (!dataSource.isFinished || e.source !== dataSource) return
          val ref = dataSource.result
          val bmp = (ref?.get() as? CloseableBitmap)?.underlyingBitmap
          e.source = null
          dataSource.close()
          if (ref == null || bmp == null) {
            CloseableReference.closeSafely(ref)
            fail(e)
            return
          }
          e.ref = ref
          e.bitmap = bmp
          e.attempts = 0
          e.arrivedAt = if (fromMemory) 0L else SystemClock.uptimeMillis()
          heldBytes += e.bytes
          version += 1
          onChanged()
        }

        override fun onProgressUpdate(dataSource: DataSource<CloseableReference<CloseableImage>>) {
          // Bytes are arriving (Fresco reports progress per chunk read): not stuck.
          if (e.source === dataSource) e.activeAt = SystemClock.uptimeMillis()
        }

        override fun onFailureImpl(dataSource: DataSource<CloseableReference<CloseableImage>>) {
          if (e.source !== dataSource) return
          e.source = null
          dataSource.close()
          fail(e)
        }
      },
      UiThreadImmediateExecutorService.getInstance(),
    )
  }

  private fun fail(e: Entry) {
    if (e.attempts < RETRY_LIMIT) {
      e.attempts += 1
      val delay = RETRY_BASE_MS shl (e.attempts - 1) // 1 s, 2 s, 4 s
      e.retryAt = SystemClock.uptimeMillis() + delay
      scheduleRetry(delay)
      return
    }
    e.failed = true
    e.failedAt = SystemClock.uptimeMillis()
    version += 1
    onChanged()
  }
}

/**
 * How many bytes of decoded bitmaps the native rows may keep referenced, from the app's memory class (the heap
 * budget Android grants it, in MB): an eighth of it, between 16 and 48 MB. The bitmaps themselves stay in Fresco's
 * shared cache; this only bounds how many the guide pins while they are on (or just off) screen. A starting point to
 * be tuned against measurements on the lowest-memory devices. 0 (unknown) gets the floor.
 */
fun imageBudgetBytes(memoryClassMb: Int): Long {
  val mb = (memoryClassMb / 8).coerceIn(16, 48)
  return mb * 1024L * 1024L
}

/**
 * The ONE pending wake-up shared by every entry waiting on a timer (retry backoff, stuck-fetch check): it tracks the
 * time the posted tick fires, and a request for an EARLIER time re-posts it; a later one is already covered (the tick's
 * redraw calls get() for every visible entry, which re-requests whatever still isn't due). Pure, unit-tested.
 */
internal class RetryWake {
  /** Uptime (ms) the posted tick fires at, or -1 when none is posted. */
  var dueAt = -1L
    private set

  /** Returns the delay to (re)post the tick with, or -1 when the posted tick already fires at or before then. */
  fun request(now: Long, delayMs: Long): Long {
    val d = delayMs.coerceAtLeast(MIN_DELAY_MS)
    val due = now + d
    if (dueAt >= 0 && dueAt <= due) return -1
    dueAt = due
    return d
  }

  fun fired() {
    dueAt = -1
  }

  fun reset() {
    dueAt = -1
  }

  companion object {
    const val MIN_DELAY_MS = 16L
  }
}
