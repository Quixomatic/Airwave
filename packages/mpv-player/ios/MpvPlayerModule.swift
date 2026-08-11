import AVFoundation
import ExpoModulesCore

public class MpvPlayerModule: Module {
  /// Headless audio-only core (§7.14 Phase B / radio channels). Created lazily on first `audioLoad`, held for
  /// the module's lifetime, and independent of the video `View`. See `MpvAudioCore`.
  private var audio: MpvAudioCore?

  public func definition() -> ModuleDefinition {
    Name("MpvPlayer")

    // Module-level (view-less) AUDIO events — the bumper bed + future radio player subscribe to these.
    Events("onAudioProgress", "onAudioEnded", "onAudioError", "onAudioBuffering")

    AsyncFunction("audioLoad") { (url: String, startTime: Double) in self.ensureAudio().load(url, startTime: startTime) }
    AsyncFunction("audioAppend") { (url: String, startTime: Double) in self.ensureAudio().append(url, startTime: startTime) }
    AsyncFunction("audioPlay") { self.audio?.play() }
    AsyncFunction("audioPause") { self.audio?.pause() }
    AsyncFunction("audioStop") { self.audio?.stop() }
    AsyncFunction("audioSeek") { (seconds: Double) in self.audio?.seek(seconds) }
    AsyncFunction("audioSetVolume") { (volume: Double) in self.audio?.setVolume(volume) }
    AsyncFunction("audioFadeVolume") { (volume: Double, durationMs: Double) in self.audio?.fadeVolume(to: volume, durationMs: durationMs) }
    AsyncFunction("audioSetMuted") { (muted: Bool) in self.audio?.setMuted(muted) }
    AsyncFunction("audioSetRate") { (rate: Double) in self.audio?.setRate(rate) }
    AsyncFunction("audioSetLoop") { (loop: Bool) in self.audio?.setLoop(loop) }

    // Report what the current audio output route advertises, so the app can show whether real 5.1/7.1 is
    // available (Settings → Audio). Configures the same long-form playback session the video player uses so
    // the numbers reflect what playback would actually get (idempotent — safe while audio is playing).
    AsyncFunction("getAudioOutputInfo") { () -> [String: Any] in
      let session = AVAudioSession.sharedInstance()
      try? session.setCategory(.playback, mode: .moviePlayback, policy: .longFormAudio, options: [])
      try? session.setActive(true)
      let out = session.currentRoute.outputs.first
      return [
        "maxChannels": session.maximumOutputNumberOfChannels,
        "currentChannels": session.outputNumberOfChannels,
        "routeName": out?.portName ?? "",
        "routeType": out?.portType.rawValue ?? "",
      ]
    }

    OnDestroy {
      self.audio?.dispose()
      self.audio = nil
    }

    View(MpvPlayerView.self) {
      Events("onLoad", "onFirstFrame", "onProgress", "onBuffering", "onTracks", "onError", "onEnd")

      // `startTime` is set alongside `source` in the same render; store it first, then a source change
      // triggers the coalesced load. (DVR seeks go through the imperative `seek` below, not startTime.)
      Prop("startTime") { (view: MpvPlayerView, t: Double) in view.setPendingStartTime(t) }
      Prop("source") { (view: MpvPlayerView, source: String?) in view.setPendingSource(source) }
      Prop("paused") { (view: MpvPlayerView, paused: Bool) in view.setPaused(paused) }
      Prop("muted") { (view: MpvPlayerView, muted: Bool) in view.setMuted(muted) }
      Prop("volume") { (view: MpvPlayerView, v: Double) in view.setVolume(v) }
      Prop("contentFit") { (view: MpvPlayerView, fit: String) in view.setContentFit(fit) }
      Prop("audioTrack") { (view: MpvPlayerView, id: Int) in view.setAudioTrack(id) }
      Prop("subtitleTrack") { (view: MpvPlayerView, id: Int) in view.setSubtitleTrack(id) }
      Prop("audioMode") { (view: MpvPlayerView, mode: String) in view.setAudioMode(mode) }
      Prop("options") { (view: MpvPlayerView, options: [String: String]?) in view.options = options ?? [:] }

      AsyncFunction("play") { (view: MpvPlayerView) in view.play() }
      AsyncFunction("pause") { (view: MpvPlayerView) in view.pause() }
      AsyncFunction("seek") { (view: MpvPlayerView, seconds: Double) in view.seek(seconds) }
    }
  }

  private func ensureAudio() -> MpvAudioCore {
    if let audio { return audio }
    let core = MpvAudioCore()
    core.onProgress = { [weak self] time, duration in
      self?.sendEvent("onAudioProgress", ["currentTime": time, "duration": duration])
    }
    core.onEnded = { [weak self] in self?.sendEvent("onAudioEnded", [:]) }
    core.onError = { [weak self] message in self?.sendEvent("onAudioError", ["message": message]) }
    core.onBuffering = { [weak self] buffering in self?.sendEvent("onAudioBuffering", ["buffering": buffering]) }
    core.setup()
    audio = core
    return core
  }
}
