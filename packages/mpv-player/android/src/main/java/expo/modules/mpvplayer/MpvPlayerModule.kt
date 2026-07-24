package expo.modules.mpvplayer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The Android twin of `ios/MpvPlayerModule.swift`. Registers the `MpvPlayer` view with the exact same
 * props/events/functions as the Apple module, so the platform-agnostic JS (`requireNativeView("MpvPlayer")`
 * + `use-tv-player`) drives it unchanged.
 */
class MpvPlayerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MpvPlayer")

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
      Prop("options") { view: MpvPlayerView, options: Map<String, String>? -> view.options = options ?: emptyMap() }

      AsyncFunction("play") { view: MpvPlayerView -> view.play() }
      AsyncFunction("pause") { view: MpvPlayerView -> view.pause() }
      AsyncFunction("seek") { view: MpvPlayerView, seconds: Double -> view.seek(seconds) }
    }
  }
}
