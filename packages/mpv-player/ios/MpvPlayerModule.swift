import ExpoModulesCore

public class MpvPlayerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MpvPlayer")

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
}
