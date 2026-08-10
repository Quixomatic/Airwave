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

  private var didSetup = false
  private var pendingSource: String? = null
  private var pendingStartTime: Double = 0.0
  private var lastLoadedSource: String? = null
  private var applyScheduled = false
  private var disposed = false

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
    surfaceView.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    )
    surfaceView.holder.addCallback(this)
    addView(surfaceView)
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

  // MARK: props

  fun setPendingSource(source: String?) {
    pendingSource = source
    scheduleApply()
  }

  fun setPendingStartTime(t: Double) {
    pendingStartTime = t
  }

  fun setContentFit(fit: String) = core.setContentFit(fit)
  fun setPaused(paused: Boolean) = core.setPaused(paused)
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
      return
    }
    core.load(src, pendingStartTime)
  }

  // MARK: MpvCoreDelegate → JS events

  override fun mpvDidLoad(duration: Double, width: Int, height: Int) {
    onLoad(mapOf("duration" to duration, "width" to width, "height" to height))
  }

  override fun mpvFirstFrame() {
    onFirstFrame(mapOf())
  }

  override fun mpvProgress(time: Double) {
    onProgress(mapOf("currentTime" to time))
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
