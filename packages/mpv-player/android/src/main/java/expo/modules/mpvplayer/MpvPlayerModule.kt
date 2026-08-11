package expo.modules.mpvplayer

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The Android twin of `ios/MpvPlayerModule.swift`. Registers the `MpvPlayer` view with the exact same
 * props/events/functions as the Apple module, so the platform-agnostic JS (`requireNativeView("MpvPlayer")`
 * + `use-tv-player`) drives it unchanged. Also exposes the module-level, view-less AUDIO API (§7.14 Phase B /
 * radio channels) via a separate headless `MpvAudioCore`.
 */
class MpvPlayerModule : Module() {
  /** Headless audio-only core, created lazily on first `audioLoad`, independent of the video `View`. */
  private var audio: MpvAudioCore? = null

  override fun definition() = ModuleDefinition {
    Name("MpvPlayer")

    // Module-level (view-less) AUDIO events — the bumper bed + future radio player subscribe to these.
    Events("onAudioProgress", "onAudioEnded", "onAudioError", "onAudioBuffering")

    AsyncFunction("audioLoad") { url: String, startTime: Double -> ensureAudio().load(url, startTime) }
    AsyncFunction("audioAppend") { url: String, startTime: Double -> ensureAudio().append(url, startTime) }
    AsyncFunction("audioPlay") { audio?.play() }
    AsyncFunction("audioPause") { audio?.pause() }
    AsyncFunction("audioStop") { audio?.stop() }
    AsyncFunction("audioSeek") { seconds: Double -> audio?.seek(seconds) }
    AsyncFunction("audioSetVolume") { volume: Double -> audio?.setVolume(volume) }
    AsyncFunction("audioFadeVolume") { volume: Double, durationMs: Double -> audio?.fadeVolume(volume, durationMs) }
    AsyncFunction("audioSetMuted") { muted: Boolean -> audio?.setMuted(muted) }
    AsyncFunction("audioSetRate") { rate: Double -> audio?.setRate(rate) }
    AsyncFunction("audioSetLoop") { loop: Boolean -> audio?.setLoop(loop) }

    // Report what the current audio output can do (Settings → Audio), mirroring the iOS probe. Android has
    // no single "session channels" number, so we take the max channel count across the output devices (the
    // HDMI/eARC sink reports the receiver's real capability) and label the widest one.
    AsyncFunction("getAudioOutputInfo") {
      val am = appContext.reactContext?.applicationContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      var maxCh = 0
      var routeName = ""
      var routeType = ""
      am?.getDevices(AudioManager.GET_DEVICES_OUTPUTS)?.forEach { d ->
        val m = d.channelCounts.maxOrNull() ?: 0
        if (m > maxCh) {
          maxCh = m
          routeName = d.productName?.toString() ?: ""
          routeType = audioDeviceTypeName(d.type)
        }
      }
      mapOf("maxChannels" to maxCh, "currentChannels" to 0, "routeName" to routeName, "routeType" to routeType)
    }

    OnDestroy {
      audio?.dispose()
      audio = null
    }

    View(MpvPlayerView::class) {
      Events("onLoad", "onFirstFrame", "onProgress", "onBuffering", "onTracks", "onError", "onEnd")

      // `startTime` is set alongside `source` in the same render; store it first, then a source change
      // triggers the coalesced load. (DVR seeks go through the imperative `seek` below, not startTime.)
      Prop("startTime") { view: MpvPlayerView, t: Double -> view.setPendingStartTime(t) }
      Prop("source") { view: MpvPlayerView, source: String? -> view.setPendingSource(source) }
      Prop("paused") { view: MpvPlayerView, paused: Boolean -> view.setPaused(paused) }
      Prop("muted") { view: MpvPlayerView, muted: Boolean -> view.setMuted(muted) }
      Prop("volume") { view: MpvPlayerView, v: Double -> view.setVolume(v) }
      Prop("contentFit") { view: MpvPlayerView, fit: String -> view.setContentFit(fit) }
      Prop("audioTrack") { view: MpvPlayerView, id: Int -> view.setAudioTrack(id) }
      Prop("subtitleTrack") { view: MpvPlayerView, id: Int -> view.setSubtitleTrack(id) }
      Prop("audioMode") { view: MpvPlayerView, mode: String -> view.setAudioMode(mode) }
      Prop("options") { view: MpvPlayerView, options: Map<String, String>? -> view.options = options ?: emptyMap() }

      AsyncFunction("play") { view: MpvPlayerView -> view.play() }
      AsyncFunction("pause") { view: MpvPlayerView -> view.pause() }
      AsyncFunction("seek") { view: MpvPlayerView, seconds: Double -> view.seek(seconds) }
    }
  }

  private fun audioDeviceTypeName(type: Int): String = when (type) {
    AudioDeviceInfo.TYPE_HDMI -> "HDMI"
    AudioDeviceInfo.TYPE_HDMI_ARC -> "HDMI ARC"
    AudioDeviceInfo.TYPE_AUX_LINE -> "Line out"
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "Bluetooth"
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Built-in speaker"
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET -> "Wired"
    else -> "Output"
  }

  private fun ensureAudio(): MpvAudioCore {
    audio?.let { return it }
    // Audio needs no Activity/UI — the application context is enough (mirrors plezy's audio plugin).
    val ctx = appContext.reactContext?.applicationContext ?: appContext.reactContext!!
    val core = MpvAudioCore(ctx)
    core.onProgress = { time, duration ->
      sendEvent("onAudioProgress", mapOf("currentTime" to time, "duration" to duration))
    }
    core.onEnded = { sendEvent("onAudioEnded", emptyMap<String, Any>()) }
    core.onError = { message -> sendEvent("onAudioError", mapOf("message" to message)) }
    core.onBuffering = { buffering -> sendEvent("onAudioBuffering", mapOf("buffering" to buffering)) }
    core.setup()
    audio = core
    return core
  }
}
