package expo.modules.mpvplayer

import android.content.Context
import android.view.Surface
import dev.jdtech.mpv.EndFileReason
import dev.jdtech.mpv.MpvEvent
import dev.jdtech.mpv.MpvPlayer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlin.math.abs

/** Events surfaced from the mpv flows up to the Expo view (mirrors the iOS `MpvCoreDelegate`). */
interface MpvCoreDelegate {
  fun mpvDidLoad(duration: Double, width: Int, height: Int)
  fun mpvFirstFrame()
  fun mpvProgress(time: Double, duration: Double)
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

  // The video output, chosen DYNAMICALLY per program (§13.5). `gpu-next` is the SDR default (mpv's own
  // renderer). On Android, gpu-next's OpenGL-ES path CANNOT passthrough HDR — it ALWAYS tone-maps HDR→SDR
  // (findroid #645, mpv-android #874, libplacebo author). So on the first decoded frame we detect HDR
  // (`video-params/sig-peak`/`max-luma`) and, for HDR content, switch to `vo=mediacodec_embed` (MediaCodec
  // renders straight to the SurfaceView = real HDR10/HLG passthrough + full frame rate) and re-open the file
  // at the same offset — exactly mirroring the Apple side, which reads gamma on first frame to drive its
  // display switch. `currentVo` is a var because it changes at runtime; `attachSurface` restores IT (not a
  // const) so an HDR program survives a surface reposition. (Do NOT global-force `mediacodec_embed` — tried
  // v0.9.1, reverted v0.9.2: it regresses SDR, which must stay on mpv's renderer.)
  private var currentVo = "gpu-next"
  // One HDR probe per user load (reset in load()); the internal re-open under the new VO must NOT re-probe.
  private var hdrChecked = false

  // A single scope drives create + all Flow collectors. MpvPlayer's suspend calls submit through its own
  // internal single-threaded native dispatcher, so ordering (options → loadfile) is preserved for us.
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var player: MpvPlayer? = null
  private var pendingSurface: Surface? = null
  private var loadedEmitted = false
  private var firstFrameEmitted = false
  // Last commanded volume in mpv units (0..100); a fade resumes from here. The hybrid single engine shares
  // this ONE `volume` between video (full) and audio-only bumper/radio content — a video load resets it.
  private var currentVolume = 100.0
  private var fadeJob: Job? = null

  // `MpvPlayer.create` is a SUSPEND function (async), so a load() call can arrive before the player
  // exists. Remember the last requested load and run it as soon as create() finishes.
  private var pendingLoadUrl: String? = null
  private var pendingLoadStart: Double = 0.0
  private var pendingLoadMode: String = "video"

  // MARK: setup

  /** Create + initialize mpv, then observe the state we surface to JS. `options` override the defaults. */
  fun setup(options: Map<String, String>) {
    scope.launch {
      val p = try {
        MpvPlayer.create(appContext) {
          // Android render path — the mpv-android / findroid recipe. Starts on gpu-next (SDR); HDR content
          // is detected on first frame and re-opened under mediacodec_embed (see maybeSwitchHdr).
          setOption("vo", currentVo)
          setOption("gpu-context", "android")
          setOption("opengl-es", "yes")
          setOption("hwdec", "mediacodec,mediacodec-copy")
          setOption("ao", "audiotrack")
          // Audio-only capability (bumper music bed + future radio) folded into this ONE engine — harmless
          // to single-file video. `append` + these make radio handoffs gapless.
          setOption("gapless-audio", "weak")
          setOption("prefetch-playlist", "yes")
          // Use the full layout the HDMI sink accepts (real 5.1/7.1 LPCM) instead of the timid `auto-safe`
          // default that caps at stereo. On a 2-channel sink this resolves to stereo (mpv folds the center
          // in), so it's correct everywhere. The JS `audioMode` setting overrides this to force stereo.
          setOption("audio-channels", "auto")
          // Signals the target colorspace to gpu-next. On a Vulkan/HDR-capable path this passes HDR metadata
          // through, but Android's OpenGL-ES gpu-next path tone-maps HDR→SDR regardless (see §13). Kept
          // (harmless) — real HDR passthrough is the dynamic mediacodec_embed arc (§13.5), not this option.
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
      p.observeDouble("time-pos").onEach { t ->
        // Carry duration too — the audio-only bumper bed derives its loop-position from it (video ignores it).
        val dur = p.getDouble("duration") ?: 0.0
        delegate?.mpvProgress(t, dur)
      }.launchIn(scope)
      p.observeFlag("paused-for-cache").onEach { delegate?.mpvBuffering(it) }.launchIn(scope)

      p.eventFlow.onEach { handleEvent(it) }.launchIn(scope)
      // Forward mpv's own logs to logcat (`adb logcat -s MpvCore`) — invaluable for diagnosing
      // no-frame / decode / VO / HDR issues on device.
      p.logFlow.onEach { android.util.Log.i("MpvCore", "[${it.level}] ${it.prefix}: ${it.text}") }.launchIn(scope)

      // A load() may have been requested before create() finished (create is suspend) — run it now.
      pendingLoadUrl?.let { doLoad(p, it, pendingLoadStart, pendingLoadMode) }
    }
  }

  // MARK: control

  /**
   * Load `url`, opening AT `startTime` seconds. mpv 0.38+ loadfile is `loadfile <url> <flags> <index>
   * <options>` — the `-1` index MUST be present before options, or the options string lands in the index
   * slot, the command is malformed, and no file loads (silent). Matches plezy's `loadfile <uri> replace -1`.
   */
  fun load(url: String, startTime: Double, mode: String = "video") {
    loadedEmitted = false
    firstFrameEmitted = false
    hdrChecked = false
    fadeJob?.cancel()
    pendingLoadUrl = url
    pendingLoadStart = startTime
    pendingLoadMode = mode
    // If the player is already up, load immediately; otherwise setup()'s create() runs it on completion.
    val p = player ?: return
    scope.launch {
      // Always probe HDR on mpv's own renderer: if a prior HDR program left us on mediacodec_embed, reset
      // to gpu-next for a clean, reliable detect (its video-params are guaranteed). SDR then stays on
      // gpu-next; HDR re-switches to embed on first frame (§13.5). Skipped for audio-only (vid=no) loads.
      if (mode != "audio" && currentVo != "gpu-next") {
        currentVo = "gpu-next"
        p.setProperty("hwdec", "mediacodec,mediacodec-copy")
        p.setProperty("vo", "gpu-next")
      }
      doLoad(p, url, startTime, mode)
    }
  }

  /**
   * `mode` is the ONLY place content-type branches (see `.plans/mpv-hybrid-core.md`). On this ONE shared
   * engine, persistent props an audio track sets (`loop-file`, faded `volume`, `speed`) would bleed into the
   * next program — so a video load RESETS them, and an audio load starts SILENT (JS fades the bumper bed in /
   * radio sets its level) + suppresses cover-art-as-video. Per-file options are ONE comma-joined arg, scoped
   * to this file (they survive seeks, not reloads).
   */
  private suspend fun doLoad(p: MpvPlayer, url: String, startTime: Double, mode: String) {
    val fileOpts = mutableListOf<String>()
    if (startTime > 0) fileOpts.add("start=${startTime.toInt()}")
    if (mode == "audio") {
      fileOpts.add("vid=no")
      fileOpts.add("audio-display=no")
      // Start silent (graceful — the outgoing program just goes quiet); JS fades the bed in. BEFORE the load
      // so the new file inherits silence and lowering the OUTGOING file can't pop.
      currentVolume = 0.0
      p.setProperty("volume", 0.0)
    }
    if (fileOpts.isEmpty()) p.command("loadfile", url, "replace", "-1")
    else p.command("loadfile", url, "replace", "-1", fileOpts.joinToString(","))
    if (mode != "audio") {
      // Video: undo persistent props audio content may have left — AFTER the loadfile, so raising the volume
      // back to full can't briefly blast the OUTGOING (faded-down) music before it's replaced.
      p.setProperty("loop-file", "no")
      p.setProperty("speed", 1.0)
      currentVolume = 100.0
      p.setProperty("volume", 100.0)
    }
  }

  fun stop() = launchOnPlayer { it.command("stop") }
  fun setPaused(paused: Boolean) = launchOnPlayer { it.setProperty("pause", paused) }
  fun setMuted(muted: Boolean) = launchOnPlayer { it.setProperty("mute", muted) }
  /** Set volume in mpv units (0..100). Cancels any in-flight fade. */
  fun setVolume(volume: Double) {
    fadeJob?.cancel()
    currentVolume = volume
    launchOnPlayer { it.setProperty("volume", volume) }
  }

  fun setAudioTrack(id: Int) = launchOnPlayer {
    if (id < 0) it.setProperty("aid", "no") else it.setProperty("aid", id)
  }

  fun setSubtitleTrack(id: Int) = launchOnPlayer {
    if (id < 0) it.setProperty("sid", "no") else it.setProperty("sid", id)
  }

  /** Audio channel layout: `"auto"` uses the full HDMI-sink layout (real 5.1/7.1), `"stereo"` forces a
   *  fold-down. Applied when the audio chain is next (re)initialized, so callers reload the current file. */
  fun setAudioChannels(layout: String) = launchOnPlayer { it.setProperty("audio-channels", layout) }

  fun setContentFit(fit: String) = launchOnPlayer {
    when (fit) {
      "cover" -> { it.setProperty("keepaspect", true); it.setProperty("panscan", 1.0) }
      "fill" -> { it.setProperty("keepaspect", false); it.setProperty("panscan", 0.0) }
      else -> { it.setProperty("keepaspect", true); it.setProperty("panscan", 0.0) }
    }
  }

  /** Absolute seek in seconds. mpv estimates → fast even on un-indexed MKV. */
  fun seek(seconds: Double) = launchOnPlayer { it.command("seek", seconds.toString(), "absolute") }

  // MARK: audio-only capabilities (bumper music bed + radio) on the same single engine

  /** Queue `url` AFTER the current track (mpv playlist `append`) — with `prefetch-playlist` the next entry
   *  opens before this one ends → gapless radio. Call after a `load`. */
  fun append(url: String, startTime: Double = 0.0) = launchOnPlayer {
    if (startTime > 0) it.command("loadfile", url, "append", "-1", "start=${startTime.toInt()}")
    else it.command("loadfile", url, "append", "-1")
  }

  /** Loop the current file at EOF (mpv `loop-file`) — ambient bumper bed + looping radio. A video load
   *  resets this to `no`, so it never bleeds into a program. */
  fun setLoop(loop: Boolean) = launchOnPlayer { it.setProperty("loop-file", if (loop) "inf" else "no") }
  /** Playback speed (1.0 = normal — mpv `speed`). */
  fun setRate(rate: Double) = launchOnPlayer { it.setProperty("speed", rate) }

  /** Smoothly ramp the volume to `target` (0..1) over `durationMs` — a native 60fps ramp of mpv's `volume`
   *  (0..100). The primitive for bumper fade in/out. Starts from the current commanded volume; cancels any
   *  prior fade. */
  fun fadeVolume(target: Double, durationMs: Double) {
    fadeJob?.cancel()
    val end = target.coerceIn(0.0, 1.0) * 100.0
    val start = currentVolume
    val p = player
    if (p == null || durationMs <= 0 || abs(end - start) < 0.1) {
      currentVolume = end
      launchOnPlayer { it.setProperty("volume", end) }
      return
    }
    fadeJob = scope.launch {
      val startNs = System.nanoTime()
      while (true) {
        val elapsedMs = (System.nanoTime() - startNs) / 1_000_000.0
        val t = (elapsedMs / durationMs).coerceAtMost(1.0)
        val v = start + (end - start) * t
        currentVolume = v
        p.setProperty("volume", v)
        if (t >= 1.0) break
        delay(16)
      }
    }
  }

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
    // first, then the VO is pointed at it. Restore `currentVo` — NOT a const — so an HDR program on
    // mediacodec_embed survives a surface reposition (mini↔full) instead of dropping back to gpu-next.
    p.setProperty("force-window", "yes")
    p.setProperty("vo", currentVo)
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
        // A frame is now decoded → width/height AND the HDR color params are guaranteed. Emit onLoad (in
        // case file-loaded didn't have dimensions yet), run the one-shot HDR probe (may re-open under
        // mediacodec_embed), then the first-frame signal.
        scope.launch { maybeEmitLoad() }
        scope.launch { maybeSwitchHdr() }
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

  /**
   * The Android HDR switch (§13.5) — mirrors how `ios/MpvCore.swift` reads the video's gamma on first
   * frame to drive its display switch. mpv's OpenGL-ES `gpu-next` path can't passthrough HDR (it tone-maps
   * HDR→SDR), so for HDR content we swap to `vo=mediacodec_embed` (+ zero-copy `hwdec=mediacodec`) — the
   * MediaCodec→SurfaceView path that IS real HDR10/HLG passthrough — and RE-OPEN the file at the same
   * offset (a clean reload, not a fragile live VO flip). SDR stays on gpu-next (mpv's full renderer).
   *
   * Detection is numeric via `getDouble` (the AAR's confirmed getter): `video-params/sig-peak` (SDR ≈ 1.0;
   * PQ/HLG > 1) with `video-params/max-luma` (mastering peak in cd/m², set for HDR10) as a hedge. Runs once
   * per user load (`hdrChecked`); the internal re-open must not re-probe or it would loop.
   */
  private suspend fun maybeSwitchHdr() {
    if (hdrChecked) return
    val p = player ?: return
    // Audio-only loads (bumper bed / radio) have no video — never touch the VO.
    if (pendingLoadMode == "audio") { hdrChecked = true; return }
    hdrChecked = true

    val sigPeak = p.getDouble("video-params/sig-peak") ?: 0.0
    val maxLuma = p.getDouble("video-params/max-luma") ?: 0.0
    val isHdr = sigPeak > 1.5 || maxLuma > 100.0
    val neededVo = if (isHdr) "mediacodec_embed" else "gpu-next"
    android.util.Log.i(
      "MpvCore",
      "HDR probe: sig-peak=$sigPeak max-luma=$maxLuma isHdr=$isHdr currentVo=$currentVo neededVo=$neededVo",
    )
    if (neededVo == currentVo) return

    // Re-open at the current offset under the new render path. `keep-open` holds the last frame, so read
    // the live position now; fall back to the requested start if unavailable.
    val pos = p.getDouble("time-pos") ?: pendingLoadStart
    currentVo = neededVo
    // Embed needs the direct (zero-copy) mediacodec decoder; gpu-next uses the copy fallback too.
    p.setProperty("hwdec", if (isHdr) "mediacodec" else "mediacodec,mediacodec-copy")
    p.setProperty("vo", neededVo)
    pendingLoadStart = pos
    android.util.Log.i("MpvCore", "HDR switch → re-opening on $neededVo at ${pos}s")
    pendingLoadUrl?.let { doLoad(p, it, pos, pendingLoadMode) }
  }
}
