package expo.modules.mpvplayer

import android.content.Context
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
import kotlin.math.abs

/**
 * A HEADLESS (no video surface) audio-only libmpv core — the Android twin of `ios/MpvAudioCore.swift`, for
 * the bumper music bed (§7.14 Phase B) and future audio-only "radio" channels. Mirrors plezy's `audioOnly`
 * path in `MpvPlayerCore.kt`: create with `vid=no` / `audio-display=no` / `force-window=no` / `vo=null` and
 * NEVER attach a Surface. Deliberately separate from `MpvCore` (the video path stays untouched); safe to run
 * as a second, independent mpv instance alongside it.
 */
class MpvAudioCore(private val appContext: Context) {
  /** (currentTime, duration) in seconds, on each `time-pos` tick. */
  var onProgress: ((Double, Double) -> Unit)? = null
  /** Natural end of the track (mpv EOF) — NOT our own stop/replace. */
  var onEnded: (() -> Unit)? = null
  /** A load/decode/network error (mpv end-file reason = error) — the message. */
  var onError: ((String) -> Unit)? = null
  /** Stalled waiting on the network buffer (mpv `paused-for-cache`). */
  var onBuffering: ((Boolean) -> Unit)? = null

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var player: MpvPlayer? = null
  // create() is suspend, so a load() can arrive before the player exists — run it on completion.
  private var pendingLoadUrl: String? = null
  private var pendingLoadStart: Double = 0.0
  // Our last commanded volume (0..1), so a fade always starts from where the last one left off.
  private var currentVolume = 1.0
  private var fadeJob: Job? = null

  fun setup() {
    scope.launch {
      val p = try {
        MpvPlayer.create(appContext) {
          // Audio-only, headless — no VO surface, ever.
          setOption("vid", "no")
          setOption("audio-display", "no")
          setOption("force-window", "no")
          setOption("vo", "null")
          setOption("ao", "audiotrack")
          setOption("gapless-audio", "weak")
          setOption("keep-open", "yes")
          setOption("cache", "yes")
        }
      } catch (e: Exception) {
        return@launch
      }
      player = p

      p.observeDouble("time-pos").onEach { t ->
        val dur = p.getDouble("duration") ?: 0.0
        onProgress?.invoke(t, dur)
      }.launchIn(scope)
      p.observeFlag("paused-for-cache").onEach { onBuffering?.invoke(it) }.launchIn(scope)

      p.eventFlow.onEach { ev ->
        if (ev is MpvEvent.EndFile) {
          when (ev.reason) {
            EndFileReason.Eof -> onEnded?.invoke()
            EndFileReason.Error -> onError?.invoke("mpv end-file error")
            else -> {}
          }
        }
      }.launchIn(scope)

      pendingLoadUrl?.let { doLoad(p, it, pendingLoadStart) }
    }
  }

  /**
   * Load `url`, opening AT `startTime` seconds — mpv estimates the byte position (range seek), so tune-in
   * mid-track is fast even on a long/un-indexed file, NOT play-from-0-then-seek. Matches the video core.
   */
  fun load(url: String, startTime: Double = 0.0) {
    pendingLoadUrl = url
    pendingLoadStart = startTime
    val p = player ?: return // setup()'s create() runs it on completion
    scope.launch { doLoad(p, url, startTime) }
  }

  private suspend fun doLoad(p: MpvPlayer, url: String, startTime: Double) {
    if (startTime > 0) p.command("loadfile", url, "replace", "-1", "start=${startTime.toInt()}")
    else p.command("loadfile", url, "replace", "-1")
  }

  fun play() = onPlayer { it.setProperty("pause", false) }
  fun pause() = onPlayer { it.setProperty("pause", true) }
  fun stop() = onPlayer { it.command("stop") }
  fun seek(seconds: Double) = onPlayer { it.command("seek", seconds.toString(), "absolute") }
  fun setMuted(muted: Boolean) = onPlayer { it.setProperty("mute", muted) }
  /** Playback speed (1.0 = normal). mpv `speed`. */
  fun setRate(rate: Double) = onPlayer { it.setProperty("speed", rate) }
  /** `v` is 0..1 (like a web `<audio>` volume); mpv's `volume` is 0..100. Cancels any in-flight fade. */
  fun setVolume(v: Double) {
    fadeJob?.cancel()
    val clamped = v.coerceIn(0.0, 1.0)
    currentVolume = clamped
    onPlayer { it.setProperty("volume", clamped * 100.0) }
  }

  /**
   * Smoothly ramp the volume to `target` (0..1) over `durationMs` — a native 60fps ramp of mpv's `volume`,
   * so it's buttery with a SINGLE bridge call. The primitive for bumper fade in/out and future radio
   * crossfades. Starts from the current commanded volume; cancels any prior fade.
   */
  fun fadeVolume(target: Double, durationMs: Double) {
    fadeJob?.cancel()
    val end = target.coerceIn(0.0, 1.0)
    val start = currentVolume
    val p = player
    if (p == null || durationMs <= 0 || abs(end - start) < 0.001) {
      currentVolume = end
      p?.let { onPlayer { it.setProperty("volume", end * 100.0) } }
      return
    }
    fadeJob = scope.launch {
      val startNs = System.nanoTime()
      while (true) {
        val elapsedMs = (System.nanoTime() - startNs) / 1_000_000.0
        val t = (elapsedMs / durationMs).coerceAtMost(1.0)
        val v = start + (end - start) * t
        currentVolume = v
        p.setProperty("volume", v * 100.0)
        if (t >= 1.0) break
        delay(16)
      }
    }
  }

  fun setLoop(loop: Boolean) = onPlayer { it.setProperty("loop-file", if (loop) "inf" else "no") }

  fun dispose() {
    val p = player
    player = null
    scope.cancel()
    if (p != null) Thread { runCatching { p.close() } }.start()
  }

  private inline fun onPlayer(crossinline block: suspend (MpvPlayer) -> Unit) {
    scope.launch { player?.let { block(it) } }
  }
}
