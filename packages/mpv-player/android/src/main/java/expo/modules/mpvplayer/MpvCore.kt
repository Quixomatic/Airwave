package expo.modules.mpvplayer

import android.content.Context
import android.view.Surface
import dev.jdtech.mpv.EndFileReason
import dev.jdtech.mpv.MpvEvent
import dev.jdtech.mpv.MpvPlayer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch

/** Events surfaced from the mpv flows up to the Expo view (mirrors the iOS `MpvCoreDelegate`). */
interface MpvCoreDelegate {
  fun mpvDidLoad(duration: Double, width: Int, height: Int)
  fun mpvFirstFrame()
  fun mpvProgress(time: Double)
  fun mpvBuffering(buffering: Boolean)
  fun mpvError(message: String)
  fun mpvEnd(reason: String)
}

/**
 * A focused libmpv wrapper — the Android twin of `ios/MpvCore.swift`. Binds the `dev.jdtech.mpv.MpvPlayer`
 * coroutine API (from the edde746/libmpv-android AAR): `create` + pre-init options, `loadfile … -1
 * start=<offset>` (the fast ffmpeg-estimated seek), and property/event Flow collection → delegate events.
 * Renders via the Android `gpu` VO into a caller-supplied Surface (a SurfaceView).
 *
 * Everything the JS contract exposes matches the iOS module 1:1, so tv-web/tv-native's effectiveTime/DVR
 * clock maps onto it unchanged.
 */
class MpvCore(private val appContext: Context) {
  var delegate: MpvCoreDelegate? = null

  // A single scope drives create + all Flow collectors. MpvPlayer's suspend calls submit through its own
  // internal single-threaded native dispatcher, so ordering (options → loadfile) is preserved for us.
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var player: MpvPlayer? = null
  private var pendingSurface: Surface? = null
  private var loadedEmitted = false
  private var firstFrameEmitted = false

  // MARK: setup

  /** Create + initialize mpv, then observe the state we surface to JS. `options` override the defaults. */
  fun setup(options: Map<String, String>) {
    scope.launch {
      val p = try {
        MpvPlayer.create(appContext) {
          // Android render path (plezy's proven recipe): the GL VO with MediaCodec hw decode.
          setOption("vo", "gpu")
          setOption("gpu-context", "android")
          setOption("opengl-es", "yes")
          setOption("hwdec", "mediacodec,mediacodec-copy")
          setOption("ao", "audiotrack")
          // Keep the last frame at EOF so a seek-back after the program ends still works.
          setOption("keep-open", "yes")
          // Big, forward-biased network cache for smooth LAN direct-play + resilient seeks.
          setOption("cache", "yes")
          setOption("demuxer-max-bytes", "150MiB")
          setOption("demuxer-max-back-bytes", "50MiB")
          for ((k, v) in options) setOption(k, v)
        }
      } catch (e: Exception) {
        delegate?.mpvError(e.message ?: "mpv create failed")
        return@launch
      }
      player = p

      // A surface may have arrived (surfaceCreated) before create finished.
      pendingSurface?.let { p.attachSurface(it) }

      // Observe the running state. Dims/duration are read synchronously at the load event instead (see
      // maybeEmitLoad), matching the iOS core — a direct get returns the current value even when the new
      // file's dimensions match the previous one (which wouldn't fire a change event).
      p.observeDouble("time-pos").onEach { delegate?.mpvProgress(it) }.launchIn(scope)
      p.observeFlag("paused-for-cache").onEach { delegate?.mpvBuffering(it) }.launchIn(scope)

      p.eventFlow.onEach { handleEvent(it) }.launchIn(scope)
    }
  }

  // MARK: control

  /**
   * Load `url`, opening AT `startTime` seconds. mpv 0.38+ loadfile is `loadfile <url> <flags> <index>
   * <options>` — the `-1` index MUST be present before options, or the options string lands in the index
   * slot, the command is malformed, and no file loads (silent). Matches plezy's `loadfile <uri> replace -1`.
   */
  fun load(url: String, startTime: Double) {
    loadedEmitted = false
    firstFrameEmitted = false
    scope.launch {
      val p = player ?: return@launch
      if (startTime > 0) {
        p.command("loadfile", url, "replace", "-1", "start=${startTime.toInt()}")
      } else {
        p.command("loadfile", url, "replace", "-1")
      }
    }
  }

  fun stop() = launchOnPlayer { it.command("stop") }
  fun setPaused(paused: Boolean) = launchOnPlayer { it.setProperty("pause", paused) }
  fun setMuted(muted: Boolean) = launchOnPlayer { it.setProperty("mute", muted) }
  fun setVolume(volume: Double) = launchOnPlayer { it.setProperty("volume", volume) }

  fun setAudioTrack(id: Int) = launchOnPlayer {
    if (id < 0) it.setProperty("aid", "no") else it.setProperty("aid", id)
  }

  fun setSubtitleTrack(id: Int) = launchOnPlayer {
    if (id < 0) it.setProperty("sid", "no") else it.setProperty("sid", id)
  }

  fun setContentFit(fit: String) = launchOnPlayer {
    when (fit) {
      "cover" -> { it.setProperty("keepaspect", true); it.setProperty("panscan", 1.0) }
      "fill" -> { it.setProperty("keepaspect", false); it.setProperty("panscan", 0.0) }
      else -> { it.setProperty("keepaspect", true); it.setProperty("panscan", 0.0) }
    }
  }

  /** Absolute seek in seconds. mpv estimates → fast even on un-indexed MKV. */
  fun seek(seconds: Double) = launchOnPlayer { it.command("seek", seconds.toString(), "absolute") }

  // MARK: surface

  fun attachSurface(surface: Surface) {
    pendingSurface = surface
    player?.attachSurface(surface)
  }

  fun detachSurface() {
    pendingSurface = null
    player?.detachSurface()
  }

  fun setSurfaceSize(width: Int, height: Int) = launchOnPlayer {
    it.setProperty("android-surface-size", "${width}x${height}")
  }

  // MARK: teardown

  fun dispose() {
    val p = player
    player = null
    pendingSurface = null
    scope.cancel()
    // close() detaches the surface + destroys mpv (AutoCloseable). Off the main thread to avoid a GPU-mutex
    // stall against view removal (plezy's detach-before-close ordering is handled inside close()).
    if (p != null) {
      Thread { runCatching { p.close() } }.start()
    }
  }

  // MARK: internals

  private inline fun launchOnPlayer(crossinline block: suspend (MpvPlayer) -> Unit) {
    scope.launch { player?.let { block(it) } }
  }

  private fun handleEvent(event: MpvEvent) {
    when (event) {
      is MpvEvent.FileLoaded -> scope.launch { maybeEmitLoad() }
      is MpvEvent.PlaybackRestart -> {
        // A frame is now decoded → width/height are guaranteed. Emit onLoad (in case file-loaded didn't
        // have dimensions yet), then the first-frame signal.
        scope.launch { maybeEmitLoad() }
        if (!firstFrameEmitted) {
          firstFrameEmitted = true
          delegate?.mpvFirstFrame()
        }
      }
      is MpvEvent.EndFile -> {
        val reason = when (event.reason) {
          EndFileReason.Eof -> "eof"
          EndFileReason.Stop -> "stop"
          EndFileReason.Quit -> "stop"
          EndFileReason.Error -> "error"
          EndFileReason.Redirect -> "redirect"
          null -> "unknown"
        }
        if (event.reason == EndFileReason.Error) delegate?.mpvError("mpv end-file error")
        delegate?.mpvEnd(reason)
      }
      else -> {}
    }
  }

  /**
   * Emit onLoad once we have dimensions. Reads width/height/duration synchronously via getDouble (mpv
   * converts its int64 width/height to double on request), so this returns the CURRENT values regardless
   * of change events. Guarded to fire once per load (reset in load()).
   */
  private suspend fun maybeEmitLoad() {
    if (loadedEmitted) return
    val p = player ?: return
    val w = (p.getDouble("width") ?: 0.0).toInt()
    val h = (p.getDouble("height") ?: 0.0).toInt()
    val dur = p.getDouble("duration") ?: 0.0
    if (w > 0 && h > 0 && !loadedEmitted) {
      loadedEmitted = true
      delegate?.mpvDidLoad(dur, w, h)
    }
  }
}
