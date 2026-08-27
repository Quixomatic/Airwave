package expo.modules.mpvplayer

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.view.Gravity
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
  // The SurfaceView lives inside an aspect-ratio container (ExoPlayer's AspectRatioFrameLayout pattern) so
  // aspect is applied ONCE per video, declaratively, in the layout pass — instead of imperatively mutating
  // the surface's layoutParams on every event (which thrashed the surface + raced the HDR switch).
  private val videoContainer = AspectRatioFrameLayout(context)

  private var didSetup = false
  private var pendingSource: String? = null
  private var pendingStartTime: Double = 0.0
  // Content mode for the NEXT load ("video" | "audio"). Set alongside `source` in one render, read by
  // applySource → core.load. Audio = the bumper music bed / radio (no video track, JS-driven volume).
  private var pendingMode: String = "video"
  private var lastLoadedSource: String? = null
  private var applyScheduled = false
  private var disposed = false
  // True while a VIDEO clip is loaded — gates keepScreenOn (below). Android has no automatic idle-timer
  // hold during playback like iOS/tvOS, so without this a playing channel dims + sleeps.
  private var videoActive = false

  // Video display dimensions (from mpvDidLoad, PAR-correct) + the requested fit, fed to videoContainer's
  // aspect. The HDR VO `mediacodec_embed` renders the MediaCodec surface directly and ignores mpv's
  // keepaspect/panscan (no mpv option fixes it — mpv-android#486), so a full-screen surface stretches
  // non-16:9 content (e.g. 3840x2076 cinema → +4% taller). The container letterboxes it. The HDR re-open is
  // also clamped to ≥ the seek offset (MpvCore.maybeSwitchHdr) so any surface reconfig can't drop the offset.
  private var videoW = 0
  private var videoH = 0
  private var contentFit = "contain"
  // Aspect-fit is DISABLED for HLS transcode streams. The HDR switch re-opens the URL (`loadfile replace`)
  // to change VO, and on a Plex transcode session that re-open + the aspect resize's surface reconfig makes
  // Plex restart the transcode from the beginning (losing the seek offset — it works fine on direct-play,
  // whose URL is a real file). So for transcode we leave the surface full (accepting the minor HDR stretch)
  // to keep seeking rock-solid. Detected from the URL — every Plex transcode session URL contains
  // "/transcode/". Direct-play (raw file) keeps the full aspect-fit.
  private var isTranscode = false

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
    // SurfaceView fills the aspect container; the container is centered in this (black) view, so any
    // letterbox/pillarbox bars are just this view's background showing through.
    surfaceView.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    )
    surfaceView.holder.addCallback(this)
    videoContainer.addView(surfaceView)
    videoContainer.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
      Gravity.CENTER,
    )
    addView(videoContainer)
    core.delegate = this
  }

  // MARK: surface lifecycle

  override fun surfaceCreated(holder: SurfaceHolder) {
    core.attachSurface(holder.surface)
  }

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
    core.setSurfaceSize(width, height)
  }

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    core.detachSurface()
  }

  /**
   * Feed the video's display aspect to the container. "cover"/"fill" (or unknown dims) → 0 = fill the whole
   * view (no letterbox); "contain"/default → the content aspect, so the container centers + letterboxes it.
   * `setAspectRatio` only re-lays-out when the ratio actually changes (once per video), so no per-event churn.
   */
  private fun applyAspect() {
    // Transcode → always fill (no container resize → no surface churn → HDR seeking stays intact).
    val fill = isTranscode || contentFit == "cover" || contentFit == "fill" || videoW <= 0 || videoH <= 0
    videoContainer.setAspectRatio(if (fill) 0f else videoW.toFloat() / videoH.toFloat())
  }

  // MARK: props

  fun setPendingSource(source: String?) {
    pendingSource = source
    isTranscode = source?.contains("/transcode/") == true
    // New program → dims unknown until its first frame; reset so applyAspect re-fits (or fills, for
    // transcode) once mpvDidLoad reports the new dimensions, rather than reusing the previous program's.
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
    core.load(src, pendingStartTime, pendingMode)
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
 * A FrameLayout that constrains itself to a target video aspect ratio (RESIZE_MODE_FIT), so a child
 * SurfaceView filling it is letterboxed rather than stretched. This is the standard ExoPlayer
 * `AspectRatioFrameLayout` technique — aspect is applied declaratively in the measure pass, and
 * `setAspectRatio` only requests a relayout when the ratio actually changes, so there's no per-event
 * surface churn. `ratio <= 0` = fill (no constraint). Centered by its parent's gravity.
 */
private class AspectRatioFrameLayout(context: Context) : FrameLayout(context) {
  private var aspectRatio = 0f

  fun setAspectRatio(ratio: Float) {
    if (aspectRatio != ratio) {
      aspectRatio = ratio
      requestLayout()
    }
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    if (aspectRatio <= 0f) return
    val w = measuredWidth
    val h = measuredHeight
    if (w == 0 || h == 0) return
    val viewAspect = w.toFloat() / h.toFloat()
    // Within tolerance of the panel aspect → fill (avoids a sub-pixel 1px letterbox on near-16:9 content).
    if (Math.abs(aspectRatio / viewAspect - 1f) <= 0.01f) return
    var nw = w
    var nh = h
    if (viewAspect < aspectRatio) {
      // Video is wider than the view → limit height (bars top/bottom).
      nh = Math.round(w / aspectRatio)
    } else {
      // Video is taller than the view → limit width (bars left/right).
      nw = Math.round(h * aspectRatio)
    }
    super.onMeasure(
      MeasureSpec.makeMeasureSpec(nw, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(nh, MeasureSpec.EXACTLY),
    )
  }
}
