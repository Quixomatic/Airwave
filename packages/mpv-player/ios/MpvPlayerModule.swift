import ExpoModulesCore

public class MpvPlayerModule: Module {
  /// Headless audio-only core (§7.14 Phase B / radio channels). Created lazily on first `audioLoad`, held for
  /// the module's lifetime, and independent of the video `View`. See `MpvAudioCore`.
  private var audio: MpvAudioCore?

  public func definition() -> ModuleDefinition {
    Name("MpvPlayer")

    // Module-level (view-less) AUDIO events — the bumper bed + future radio player subscribe to these.
    Events("onAudioProgress", "onAudioEnded")

    AsyncFunction("audioLoad") { (url: String) in self.ensureAudio().load(url) }
    AsyncFunction("audioPlay") { self.audio?.play() }
    AsyncFunction("audioPause") { self.audio?.pause() }
    AsyncFunction("audioStop") { self.audio?.stop() }
    AsyncFunction("audioSeek") { (seconds: Double) in self.audio?.seek(seconds) }
    AsyncFunction("audioSetVolume") { (volume: Double) in self.audio?.setVolume(volume) }
    AsyncFunction("audioSetLoop") { (loop: Bool) in self.audio?.setLoop(loop) }

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
    core.setup()
    audio = core
    return core
  }
}
