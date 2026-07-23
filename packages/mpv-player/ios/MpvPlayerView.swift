import AVFoundation
import ExpoModulesCore
import UIKit

/// The Expo view: hosts the `AVSampleBufferDisplayLayer` that MPVKit's `avfoundation` VO renders into,
/// owns an `MpvCore`, and forwards core events to JS. Loads are coalesced so `source` + `startTime`
/// (set together in one render) apply as a single `loadfile … start=` — DVR seeks use `seek()` instead.
final class MpvPlayerView: ExpoView, MpvCoreDelegate {
  private let core = MpvCore()
  private let videoLayer = AVSampleBufferDisplayLayer()

  private var didSetup = false
  private var pendingSource: String?
  private var pendingStartTime: Double = 0
  private var lastLoadedSource: String?
  private var applyScheduled = false

  var options: [String: String] = [:]

  // Events (names must match `Events(...)` in the module).
  let onLoad = EventDispatcher()
  let onFirstFrame = EventDispatcher()
  let onProgress = EventDispatcher()
  let onBuffering = EventDispatcher()
  let onTracks = EventDispatcher()
  let onError = EventDispatcher()
  let onEnd = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    videoLayer.videoGravity = .resizeAspect
    videoLayer.backgroundColor = UIColor.black.cgColor
    layer.addSublayer(videoLayer)
    core.delegate = self
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // No implicit animation on the video layer during resize.
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    videoLayer.frame = bounds
    CATransaction.commit()
  }

  // MARK: props

  func setPendingSource(_ source: String?) {
    pendingSource = source
    scheduleApply()
  }
  func setPendingStartTime(_ t: Double) { pendingStartTime = t }

  func setContentFit(_ fit: String) {
    switch fit {
    case "cover": videoLayer.videoGravity = .resizeAspectFill
    case "fill": videoLayer.videoGravity = .resize
    default: videoLayer.videoGravity = .resizeAspect
    }
  }

  func setPaused(_ paused: Bool) { core.setPaused(paused) }
  func setMuted(_ muted: Bool) { core.setMuted(muted) }
  func setVolume(_ v: Double) { core.setVolume(v) }
  func setAudioTrack(_ id: Int) { core.setAudioTrack(id) }
  func setSubtitleTrack(_ id: Int) { core.setSubtitleTrack(id) }

  // MARK: imperative control (from module AsyncFunctions)

  func play() { core.setPaused(false) }
  func pause() { core.setPaused(true) }
  func seek(_ seconds: Double) { core.seek(seconds) }

  // MARK: load coalescing

  private func scheduleApply() {
    if applyScheduled { return }
    applyScheduled = true
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.applyScheduled = false
      self.applySource()
    }
  }

  private func applySource() {
    if !didSetup { didSetup = core.setup(layer: videoLayer, options: options) }
    guard pendingSource != lastLoadedSource else { return }
    lastLoadedSource = pendingSource
    guard let src = pendingSource, !src.isEmpty else {
      core.stop()
      return
    }
    core.load(url: src, startTime: pendingStartTime)
  }

  // MARK: MpvCoreDelegate → JS events

  func mpvDidLoad(duration: Double, width: Int, height: Int) {
    onLoad(["duration": duration, "width": width, "height": height])
  }
  func mpvFirstFrame() { onFirstFrame([:]) }
  func mpvProgress(time: Double) { onProgress(["currentTime": time]) }
  func mpvBuffering(_ buffering: Bool) { onBuffering(["buffering": buffering]) }
  func mpvError(_ message: String) { onError(["message": message]) }
  func mpvEnd(reason: String) { onEnd(["reason": reason]) }

  deinit { core.dispose() }
}
