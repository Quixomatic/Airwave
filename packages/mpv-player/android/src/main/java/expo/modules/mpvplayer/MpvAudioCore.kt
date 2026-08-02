package expo.modules.mpvplayer

import android.content.Context
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

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var player: MpvPlayer? = null
  // create() is suspend, so a load() can arrive before the player exists — run it on completion.
  private var pendingLoadUrl: String? = null

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

      p.eventFlow.onEach { ev ->
        if (ev is MpvEvent.EndFile && ev.reason == EndFileReason.Eof) onEnded?.invoke()
      }.launchIn(scope)

      pendingLoadUrl?.let { p.command("loadfile", it, "replace", "-1") }
    }
  }

  fun load(url: String) {
    pendingLoadUrl = url
    val p = player ?: return // setup()'s create() runs it on completion
    scope.launch { p.command("loadfile", url, "replace", "-1") }
  }

  fun play() = onPlayer { it.setProperty("pause", false) }
  fun pause() = onPlayer { it.setProperty("pause", true) }
  fun stop() = onPlayer { it.command("stop") }
  fun seek(seconds: Double) = onPlayer { it.command("seek", seconds.toString(), "absolute") }
  /** `v` is 0..1 (like a web `<audio>` volume); mpv's `volume` is 0..100. */
  fun setVolume(v: Double) = onPlayer { it.setProperty("volume", (v * 100.0).coerceIn(0.0, 100.0)) }
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
