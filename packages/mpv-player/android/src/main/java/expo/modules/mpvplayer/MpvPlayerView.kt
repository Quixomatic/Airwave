package expo.modules.mpvplayer

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.widget.FrameLayout
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * The Expo view — the Android twin of `ios/MpvPlayerView.swift`. Hosts a `SurfaceView` that mpv's Android
 * `gpu` VO renders into, owns an `MpvCore`, and forwards core events to JS. Loads are coalesced so `source`
 * + `startTime` (set together in one render) apply as a single `loadfile … start=` — DVR seeks use `seek()`.
 */
@SuppressLint("ViewConstructor")
class MpvPlayerView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext), MpvCoreDelegate, SurfaceHolder.Callback {

  private val core = MpvCore(context.applicationContext)
  private val surfaceView = SurfaceView(context)
  // A full-size container that measures + lays out + CENTERS the SurfaceView itself. We do NOT rely on the
  // parent centering a self-shrunk container (React Native lays a native view's children out top-left and
  // ignores Android layout_gravity → the old AspectRatioFrameLayout landed off-center: bars only on the right/
  // bottom), and we do NOT rely on requestLayout() (it doesn't propagate inside an RN view subtree, so an
  // aspect change stuck until a full remount). The container fills; only the SurfaceView is letterboxed, and
  // ONLY on the HDR path (see applyAspect). SDR/mini → the SurfaceView fills = the pre-0.13.19 full surface,
  // so mpv's gpu-next handles the letterbox exactly as it always did.
  private val videoContainer = VideoContainer(context)

  private var didSetup = false
  private var pendingSource: String? = null
  private var pendingStartTime: Double = 0.0
  // Content mode for the NEXT load ("video" | "audio"). Set alongside `source` in one render, read by
  // applySource → core.load. Audio = the bumper music bed / radio (no video track, JS-driven volume).
  private var pendingMode: String = "video"
  // Dynamic range for the NEXT load ("hdr" | "sdr" | null). Set alongside `source` (from the server's
  // guide.hdr), read by applySource → core.load to pick the VO up front. null (bumper/audio) leaves the VO.
  private var pendingDynamicRange: String? = null
  private var lastLoadedSource: String? = null
  private var applyScheduled = false
  private var disposed = false
  // True while a VIDEO clip is loaded — gates keepScreenOn (below). Android has no automatic idle-timer
  // hold during playback like iOS/tvOS, so without this a playing channel dims + sleeps.
  private var videoActive = false

  // Video display dimensions + the requested fit, fed to videoContainer's aspect. The HDR VO
  // `mediacodec_embed` renders the MediaCodec surface directly and ignores mpv's keepaspect/panscan (no mpv
  // option fixes it — mpv-android#486), so a full-screen surface stretches non-16:9 content (e.g. 3840x2076
  // cinema → +4% taller). The container letterboxes it. The real display size arrives via `mpvVideoSize` (the
  // core watches mpv's dwidth/dheight as they settle — the first read can be a placeholder like 960x540 before
  // the frame decodes). That updates videoW/videoH and re-letterboxes (applyAspect → videoContainer.targetRatio,
  // which centers the SurfaceView). SDR leaves the surface full-screen so mpv's gpu-next letterboxes it itself.
  private var videoW = 0
  private var videoH = 0
  private var contentFit = "contain"

  var options: Map<String, String> = emptyMap()
  // "auto" = full negotiated multichannel layout (default); "stereo" = force a fold-down. Merged into the
  // init options so the first load is right, and pushed live (setAudioChannels) for a mid-playback switch.
  private var audioMode: String = "auto"

  // Events (names must match `Events(...)` in the module).
  private val onLoad by EventDispatcher()
  private val onFirstFrame by EventDispatcher()
  private val onProgress by EventDispatcher()
  private val onBuffering by EventDispatcher()

  @Suppress("unused")
  private val onTracks by EventDispatcher()
  private val onError by EventDispatcher()
  private val onEnd by EventDispatcher()

  init {
    setBackgroundColor(Color.BLACK)
    // The container fills this (black) view and lays the SurfaceView out itself (centered, sized per
    // targetRatio). Any letterbox/pillarbox bars are the black background showing through.
    surfaceView.holder.addCallback(this)
    videoContainer.addView(surfaceView)
    videoContainer.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    )
    addView(videoContainer)
    core.delegate = this
  }

  // MARK: surface lifecycle

  override fun surfaceCreated(holder: SurfaceHolder) {
    core.attachSurface(holder.surface)
  }

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
    android.util.Log.i("MpvCore", "surfaceChanged ${width}x${height} (view=${this.width}x${this.height})")
    core.setSurfaceSize(width, height)
  }

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    core.detachSurface()
  }

  /**
   * Feed the video's display aspect to the container — but ONLY on the HDR path. The HDR VO
   * `mediacodec_embed` renders the MediaCodec surface directly and ignores mpv's keepaspect/panscan
   * (mpv-android#486), so a full-screen surface stretches non-16:9 content → we letterbox at the view layer.
   * On SDR, mpv's own renderer (gpu-next) letterboxes correctly inside the full-screen surface via
   * keepaspect/panscan, so we leave the container FILLING (ratio 0) and let mpv handle it — no view-layer
   * constraint, and no surface-resize churn from resizing the SurfaceView off full-screen. "cover"/"fill" (or
   * unknown dims) → 0 = fill even on HDR. `VideoContainer.targetRatio` only re-lays-out when the ratio actually
   * changes (once per video), so no per-event churn.
   */
  private fun applyAspect() {
    val hdr = pendingDynamicRange == "hdr"
    val forceFill = contentFit == "cover" || contentFit == "fill"
    val ratio = if (hdr && !forceFill && videoW > 0 && videoH > 0) videoW.toFloat() / videoH.toFloat() else 0f
    android.util.Log.i("MpvCore", "applyAspect ratio=$ratio (video=${videoW}x${videoH} fit=$contentFit hdr=$hdr)")
    videoContainer.targetRatio = ratio
  }

  // MARK: props

  fun setPendingSource(source: String?) {
    pendingSource = source
    // New program → dims unknown until its first frame; reset so applyAspect re-fits once the size is reported
    // (via mpvVideoSize), rather than reusing the previous program's.
    videoW = 0
    videoH = 0
    applyAspect()
    scheduleApply()
  }

  fun setPendingStartTime(t: Double) {
    pendingStartTime = t
  }

  fun setPendingMode(mode: String) {
    pendingMode = if (mode == "audio") "audio" else "video"
  }

  /** The program's dynamic range for the next load — "hdr"/"sdr" (from the server's guide.hdr) picks the VO
   *  up front; null (bumper/audio) leaves the VO untouched. Set alongside `source`; applied at applySource. */
  fun setPendingHdr(dynamicRange: String?) {
    pendingDynamicRange = when (dynamicRange) {
      "hdr" -> "hdr"
      "sdr" -> "sdr"
      else -> null
    }
  }

  /** The panel's HDR capability (staged for the future display-gated VO decision; not yet consulted). */
  fun setSupportsHdr(supported: Boolean) = core.setSupportsHdr(supported)

  fun setContentFit(fit: String) {
    contentFit = fit
    core.setContentFit(fit) // keepaspect/panscan for the SDR gpu-next path
    applyAspect() // container letterbox for the HDR mediacodec_embed path
  }
  fun setPaused(paused: Boolean) {
    // Keep the screen awake only while a video is actually playing; release it on pause so the device can
    // still sleep when paused. `keepScreenOn` sets the window's FLAG_KEEP_SCREEN_ON while the view is
    // attached, and clears automatically on unmount. Android-only — iOS/tvOS hold the idle timer natively.
    surfaceView.keepScreenOn = videoActive && !paused
    core.setPaused(paused)
  }
  fun setMuted(muted: Boolean) = core.setMuted(muted)
  fun setVolume(v: Double) = core.setVolume(v)
  fun setAudioTrack(id: Int) = core.setAudioTrack(id)
  fun setSubtitleTrack(id: Int) = core.setSubtitleTrack(id)
  fun setAudioMode(mode: String) {
    audioMode = if (mode == "stereo") "stereo" else "auto"
    core.setAudioChannels(audioMode) // live switch (no-op until setup); JS reloads the program to apply
  }

  // MARK: imperative control (from module AsyncFunctions)

  fun play() = core.setPaused(false)
  fun pause() = core.setPaused(true)
  fun seek(seconds: Double) = core.seek(seconds)
  // Audio-only capabilities (bumper bed + radio) on the same single engine.
  fun fadeVolume(target: Double, durationMs: Double) = core.fadeVolume(target, durationMs)
  fun setLoop(loop: Boolean) = core.setLoop(loop)
  fun setRate(rate: Double) = core.setRate(rate)
  fun appendTrack(url: String, startTime: Double) = core.append(url, startTime)

  // MARK: load coalescing

  private fun scheduleApply() {
    if (applyScheduled) return
    applyScheduled = true
    post {
      applyScheduled = false
      applySource()
    }
  }

  private fun applySource() {
    if (disposed) return
    if (!didSetup) {
      // Inject the current audio mode so the first load negotiates the right layout (options override the
      // core's `audio-channels` default). Later switches go through setAudioMode → live property + reload.
      core.setup(options + mapOf("audio-channels" to audioMode))
      didSetup = true
    }
    if (pendingSource == lastLoadedSource) return
    lastLoadedSource = pendingSource
    val src = pendingSource
    if (src.isNullOrEmpty()) {
      core.stop()
      videoActive = false
      surfaceView.keepScreenOn = false
      return
    }
    core.load(src, pendingStartTime, pendingMode, pendingDynamicRange)
    // Video playback keeps the screen awake (audio-only bumper/radio doesn't); paused state refines it.
    videoActive = pendingMode != "audio"
    surfaceView.keepScreenOn = videoActive
  }

  // MARK: MpvCoreDelegate → JS events

  override fun mpvDidLoad(duration: Double, width: Int, height: Int) {
    if (width > 0 && height > 0 && (width != videoW || height != videoH)) {
      videoW = width
      videoH = height
      applyAspect()
    }
    onLoad(mapOf("duration" to duration, "width" to width, "height" to height))
  }

  /**
   * The real display size (mpv dwidth/dheight), pushed as it settles after load — the first read can be a
   * placeholder (e.g. 960x540) before the frame decodes. Updating videoW/videoH re-letterboxes via applyAspect
   * (the ratio change triggers the relayout). Runs on the UI thread (core scope = Main).
   */
  override fun mpvVideoSize(width: Int, height: Int) {
    if (width > 0 && height > 0 && (width != videoW || height != videoH)) {
      videoW = width
      videoH = height
      applyAspect()
    }
  }

  override fun mpvFirstFrame() {
    onFirstFrame(mapOf())
  }

  override fun mpvProgress(time: Double, duration: Double) {
    onProgress(mapOf("currentTime" to time, "duration" to duration))
  }

  override fun mpvBuffering(buffering: Boolean) {
    onBuffering(mapOf("buffering" to buffering))
  }

  override fun mpvError(message: String) {
    onError(mapOf("message" to message))
  }

  override fun mpvEnd(reason: String) {
    onEnd(mapOf("reason" to reason))
  }

  // MARK: teardown

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    if (!disposed) {
      disposed = true
      core.dispose()
    }
  }
}

/**
 * A full-size FrameLayout that sizes + CENTERS its single child (the SurfaceView) itself.
 *
 * `targetRatio == 0` → the child fills the container (the pre-0.13.19 full-screen surface: mpv's own
 * gpu-next renderer letterboxes SDR correctly inside it). `targetRatio > 0` → the child is letterboxed to
 * that aspect and centered — used ONLY for the HDR VO `mediacodec_embed`, which renders the MediaCodec
 * surface directly and ignores mpv's keepaspect/panscan (mpv-android#486), so it must be shaped at the view
 * layer.
 *
 * Two things this deliberately does NOT rely on, because both fail inside a React Native native view:
 *  - **Parent gravity.** We center the child explicitly (child.layout), not via layout_gravity — RN lays a
 *    native view's children out itself and doesn't honor Android gravity.
 *  - **requestLayout() propagation.** RN's UIManager owns the layout pass and does not re-lay-out a native
 *    ViewGroup's children when it calls requestLayout(). The documented workaround (Shopify) is to override
 *    requestLayout() and post a runnable that measures + lays out ourselves — which drives our onLayout, so
 *    an aspect change (or a reset to fill) takes effect immediately instead of sticking until a full remount.
 */
private class VideoContainer(context: Context) : FrameLayout(context) {
  // 0 = child fills; else the child is letterboxed to this aspect and centered.
  var targetRatio = 0f
    set(value) {
      if (field != value) {
        field = value
        requestLayout()
      }
    }

  private val measureAndLayout = Runnable {
    measure(
      MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
    )
    layout(left, top, right, bottom)
  }

  override fun requestLayout() {
    super.requestLayout()
    // RN won't run our layout pass on its own — post one (the canonical RN Android workaround).
    post(measureAndLayout)
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val cw = r - l
    val ch = b - t
    val child = getChildAt(0) ?: return
    if (cw <= 0 || ch <= 0) return
    var w = cw
    var h = ch
    if (targetRatio > 0f) {
      val viewAspect = cw.toFloat() / ch.toFloat()
      // Within tolerance of the container aspect → fill (avoids a sub-pixel 1px bar on near-16:9 content).
      if (Math.abs(targetRatio / viewAspect - 1f) > 0.01f) {
        if (viewAspect < targetRatio) {
          h = Math.round(cw / targetRatio) // video wider than container → bars top/bottom
        } else {
          w = Math.round(ch * targetRatio) // video taller than container → bars left/right
        }
      }
    }
    val left = (cw - w) / 2
    val top = (ch - h) / 2
    child.measure(
      MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY),
    )
    child.layout(left, top, left + w, top + h)
    android.util.Log.i("MpvCore", "layout surface ${w}x${h} at ($left,$top) container=${cw}x${ch} ratio=$targetRatio")
  }
}
