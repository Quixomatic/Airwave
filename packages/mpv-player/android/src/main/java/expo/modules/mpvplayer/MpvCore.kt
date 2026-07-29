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
import kotlinx.coroutines.runBlocking

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
 * Renders via the Android `gpu-next` VO into a caller-supplied Surface (a SurfaceView).
 *
 * Everything the JS contract exposes matches the iOS module 1:1, so tv-web/tv-native's effectiveTime/DVR
 * clock maps onto it unchanged. The Android *surface lifecycle* + *HDR* follow the two canonical mpv-Android
 * references (`.refs/mpv-android/.../BaseMPVView.kt` + `.refs/findroid/.../mpv/MPVPlayer.kt`), NOT plezy
 * (whose Android HDR lives on its ExoPlayer path, not mpv).
 */
class MpvCore(private val appContext: Context) {
  var delegate: MpvCoreDelegate? = null

  // The video output. PATH A EXPERIMENT (v0.9.1): mpv's OpenGL-ES VO (gpu-next) CANNOT do HDR passthrough on
  // Android — it ALWAYS tone-maps HDR→SDR (findroid #645, mpv-android #874, libplacebo author confirmed),
  // which is exactly why HDR played as low-frame-rate SDR (the per-frame tone-map is what tanked the frame
  // rate on the Streamer's GPU). `mediacodec_embed` instead lets MediaCodec render decoded frames DIRECTLY to
  // the SurfaceView (Google's official HDR-video path, the same one ExoPlayer uses) → real HDR10/HLG
  // passthrough + NO GPU tone-map (frame rate recovers). Trade-off: mpv gives up its own renderer (no
  // gpu-next scaling / OSD / subtitle rendering / panscan) — acceptable for us (subs are server-burned and we
  // direct-play). REVERT = change this one line back to "gpu-next" (+ hwdec below). See `.plans/tv-native.md`
  // §13 for the full analysis + the ExoPlayer alternative (Path C).
  private val vo = "mediacodec_embed"

  // A single scope drives create + all Flow collectors. MpvPlayer's suspend calls submit through its own
  // internal single-threaded native dispatcher, so ordering (options → loadfile) is preserved for us.
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var player: MpvPlayer? = null
  private var pendingSurface: Surface? = null
  private var loadedEmitted = false
  private var firstFrameEmitted = false

  // `MpvPlayer.create` is a SUSPEND function (async), so a load() call can arrive before the player
  // exists. Remember the last requested load and run it as soon as create() finishes.
  private var pendingLoadUrl: String? = null
  private var pendingLoadStart: Double = 0.0

  // MARK: setup

  /** Create + initialize mpv, then observe the state we surface to JS. `options` override the defaults. */
  fun setup(options: Map<String, String>) {
    scope.launch {
      val p = try {
        MpvPlayer.create(appContext) {
          // Android render path — the mpv-android / findroid recipe.
          setOption("vo", vo)
          // gpu-context / opengl-es configure the gpu-next VO; inert under mediacodec_embed but left in place
          // so reverting `vo` to "gpu-next" restores the working GL config in one line.
          setOption("gpu-context", "android")
          setOption("opengl-es", "yes")
          // mediacodec_embed needs the DIRECT (zero-copy) MediaCodec decoder that renders straight to the
          // surface — the "-copy" variant reads frames back to the CPU and can't feed the embed VO. (Was
          // "mediacodec,mediacodec-copy" under the gpu-next VO.)
          setOption("hwdec", "mediacodec")
          setOption("ao", "audiotrack")
          // gpu-next-only (inert under mediacodec_embed, which passes HDR through natively). Left in place so
          // reverting `vo` to "gpu-next" restores the prior config in one line.
          setOption("target-colorspace-hint", "yes")
          // Keep the last frame at EOF so a seek-back after the program ends still works.
          setOption("keep-open", "yes")
          // Big, forward-biased network cache for smooth LAN direct-play + resilient seeks.
          setOption("cache", "yes")
          setOption("demuxer-max-bytes", "150MiB")
          setOption("demuxer-max-back-bytes", "50MiB")
          // Don't init the VO until a surface exists — mpv-android sets this to avoid a premature VO init
          // before surfaceCreated(); attachSurface() flips it back to "yes".
          setOption("force-window", "no")
          for ((k, v) in options) setOption(k, v)
        }
      } catch (e: Exception) {
        delegate?.mpvError(e.message ?: "mpv create failed")
        return@launch
      }
      player = p

      // A surface may have arrived (surfaceCreated) before create finished — attach it the full way.
      pendingSurface?.let { attachSurfaceInternal(p, it) }

      // Observe the running state. Dims/duration are read synchronously at the load event instead (see
      // maybeEmitLoad), matching the iOS core — a direct get returns the current value even when the new
      // file's dimensions match the previous one (which wouldn't fire a change event).
      p.observeDouble("time-pos").onEach { delegate?.mpvProgress(it) }.launchIn(scope)
      p.observeFlag("paused-for-cache").onEach { delegate?.mpvBuffering(it) }.launchIn(scope)

      p.eventFlow.onEach { handleEvent(it) }.launchIn(scope)
      // Forward mpv's own logs to logcat (`adb logcat -s MpvCore`) — invaluable for diagnosing
      // no-frame / decode / VO / HDR issues on device.
      p.logFlow.onEach { android.util.Log.i("MpvCore", "[${it.level}] ${it.prefix}: ${it.text}") }.launchIn(scope)

      // A load() may have been requested before create() finished (create is suspend) — run it now.
      pendingLoadUrl?.let { doLoad(p, it, pendingLoadStart) }
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
    pendingLoadUrl = url
    pendingLoadStart = startTime
    // If the player is already up, load immediately; otherwise setup()'s create() runs it on completion.
    val p = player ?: return
    scope.launch { doLoad(p, url, startTime) }
  }

  private suspend fun doLoad(p: MpvPlayer, url: String, startTime: Double) {
    if (startTime > 0) {
      p.command("loadfile", url, "replace", "-1", "start=${startTime.toInt()}")
    } else {
      p.command("loadfile", url, "replace", "-1")
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
  //
  // The surface lifecycle IS the Android playback-hardening fix. mpv's VO holds a raw pointer to the Android
  // surface; if the surface is destroyed (view repositioned full↔mini, backgrounded, or reconfigured) while
  // the VO is still active, the next render/reconfig hits a dangling pointer → "Missing surface pointer" →
  // "no video". Because the DVR tune-in seeks to the live offset on load, that reconfig happened immediately
  // → DVR never activated. The canonical fix (mpv-android BaseMPVView / findroid MPVPlayer): DISABLE the VO
  // (`vo=null`) before detaching, and RE-ENABLE it after re-attaching.

  private suspend fun attachSurfaceInternal(p: MpvPlayer, surface: Surface) {
    p.attachSurface(surface)
    // Force a window + bring the VO back (it is "null" after any prior detach). Order matters: surface
    // first, then the VO is pointed at it.
    p.setProperty("force-window", "yes")
    p.setProperty("vo", vo)
  }

  fun attachSurface(surface: Surface) {
    pendingSurface = surface
    val p = player ?: return // setup() attaches pendingSurface once create() finishes
    scope.launch { attachSurfaceInternal(p, surface) }
  }

  fun detachSurface() {
    pendingSurface = null
    val p = player ?: return
    // Disable the VO + force-window BEFORE detaching so mpv stops rendering to the surface instead of
    // holding a dangling pointer. runBlocking mirrors mpv-android's SYNCHRONOUS teardown: the surface is
    // invalid the instant surfaceDestroyed() returns, so vo=null must land first (mpv-android notes even
    // this can't fully guarantee VO deinit finished — it's the best-effort the reference settles on).
    runBlocking {
      runCatching {
        p.setProperty("vo", "null")
        p.setProperty("force-window", "no")
      }
    }
    runCatching { p.detachSurface() }
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
