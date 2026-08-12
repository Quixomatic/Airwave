import AVFoundation
#if os(tvOS)
  import AVKit
#endif
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
  // Content mode for the NEXT load ("video" | "audio"). Set alongside `source` in one render, read by
  // applySource → core.load. Audio = the bumper music bed / radio (no video track, JS-driven volume).
  private var pendingMode: String = "video"
  // The mode of the CURRENTLY loaded file (set at load time). Gates tvOS HDR display-criteria: an audio-only
  // load (bumper bed) must NOT touch the HDMI dynamic-range mode, or every bumper would bounce an HDR program
  // HDR→SDR→HDR (a black re-sync). We leave the last program's criteria in place across the bumper.
  private var currentMode: String = "video"
  private var lastLoadedSource: String?
  private var applyScheduled = false
  private var lastWidth: Int = 0
  private var lastHeight: Int = 0
  #if os(tvOS)
    // Cross-instance so a channel change (old view torn down, new one built) doesn't redundantly clear +
    // re-apply the same mode and black-flash the HDMI link between clips.
    private static var activeDisplayCriteriaKey: String?
    private weak var criteriaWindow: UIWindow?
  #endif

  var options: [String: String] = [:]
  // "auto" = full negotiated multichannel route (default); "stereo" = force a fold-down. Merged into the
  // init options so the FIRST load is right, and pushed live (setAudioChannels) so a settings change that
  // reloads the current program takes effect.
  private var audioMode: String = "auto"

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
  func setPendingMode(_ mode: String) { pendingMode = (mode == "audio") ? "audio" : "video" }

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
  func setAudioMode(_ mode: String) {
    audioMode = (mode == "stereo") ? "stereo" : "auto"
    core.setAudioChannels(audioMode) // live switch (no-op until setup); JS reloads the program to apply
  }

  // MARK: imperative control (from module AsyncFunctions)

  func play() { core.setPaused(false) }
  func pause() { core.setPaused(true) }
  func seek(_ seconds: Double) { core.seek(seconds) }
  // Audio-only capabilities (bumper bed + radio) on the same single engine.
  func fadeVolume(_ target: Double, _ durationMs: Double) { core.fadeVolume(to: target, durationMs: durationMs) }
  func setLoop(_ loop: Bool) { core.setLoop(loop) }
  func setRate(_ rate: Double) { core.setRate(rate) }
  func appendTrack(_ url: String, _ startTime: Double) { core.append(url: url, startTime: startTime) }

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
    if !didSetup {
      // Inject the current audio mode so the first load negotiates the right layout (options override the
      // core's `audio-channels` default). Later switches go through setAudioMode → live property + reload.
      var opts = options
      opts["audio-channels"] = audioMode
      didSetup = core.setup(layer: videoLayer, options: opts)
    }
    guard pendingSource != lastLoadedSource else { return }
    lastLoadedSource = pendingSource
    guard let src = pendingSource, !src.isEmpty else {
      core.stop()
      // Leaving playback (back to the guide) — drop the HDMI back to SDR for the UI.
      #if os(tvOS)
        clearDisplayCriteria()
      #endif
      return
    }
    currentMode = pendingMode
    core.load(url: src, startTime: pendingStartTime, mode: pendingMode)
  }

  // MARK: MpvCoreDelegate → JS events

  func mpvDidLoad(duration: Double, width: Int, height: Int) {
    lastWidth = width
    lastHeight = height
    onLoad(["duration": duration, "width": width, "height": height])
  }
  func mpvFirstFrame() { onFirstFrame([:]) }
  func mpvProgress(time: Double, duration: Double) { onProgress(["currentTime": time, "duration": duration]) }
  func mpvBuffering(_ buffering: Bool) { onBuffering(["buffering": buffering]) }
  func mpvError(_ message: String) { onError(["message": message]) }
  func mpvEnd(reason: String) { onEnd(["reason": reason]) }

  func mpvColorInfo(gamma: String?, primaries: String?, colorMatrix: String?, fps: Double, sigPeak: Double) {
    #if os(tvOS)
      // An audio-only load (bumper bed / radio) reports no real colorimetry — do NOT drive the HDMI dynamic
      // range from it, or it would clear a program's HDR mode for the bumper and re-sync HDR→SDR→HDR. Leave
      // the current program's criteria untouched across the bumper; the next program re-establishes its own.
      if currentMode == "audio" { return }
      applyDisplayCriteria(gamma: gamma, primaries: primaries, colorMatrix: colorMatrix, fps: fps, sigPeak: sigPeak)
    #endif
  }

  // MARK: tvOS HDR — HDMI display-mode switching
  //
  // mpv renders its own frames (avfoundation VO), so unlike AVPlayer tvOS never auto-switches the HDMI
  // output to HDR — and `target-colorspace-hint` is inert in that VO while EDR is iOS-only. The ONLY path
  // to real HDR on the Apple TV is driving the window's `AVDisplayManager` with an `AVDisplayCriteria`
  // built from a `CMFormatDescription` tagged with the content's colorimetry. Ported from
  // `.refs/plezy` (ios/Runner/MpvPlayer/MpvPlayerCore.swift). Phase 1 = HDR10 + HLG (Dolby Vision Profile
  // 8.1 rips light up as HDR10 here, since mpv decodes their PQ base layer); true DV mode is a later phase.

  #if os(tvOS)
    private enum DynamicRange: String { case sdr = "SDR", hdr10 = "HDR10", hlg = "HLG" }

    private func applyDisplayCriteria(gamma: String?, primaries: String?, colorMatrix: String?, fps: Double, sigPeak: Double) {
      guard #available(tvOS 17.0, *) else { return }
      guard let window = self.window else { return }
      criteriaWindow = window
      let dm = window.avDisplayManager
      // Respects the Apple TV's "Match Content → Match Dynamic Range" toggle.
      guard dm.isDisplayCriteriaMatchingEnabled else { return }

      let source = Self.resolveDynamicRange(gamma: gamma, primaries: primaries, colorMatrix: colorMatrix, sigPeak: sigPeak)
      let display = Self.supported(source)
      // Only DRIVE the HDMI link for HDR content. SDR — which is EVERY capability-diagnostic clip and most
      // SDR playback — just releases any HDR mode we set; we never set an "SDR criteria", which would
      // needlessly renegotiate the display on every clip (and hammer it during the 49-clip diagnostic).
      guard display != .sdr else {
        clearDisplayCriteria()
        return
      }

      let refreshRate = Float(fps > 0 ? fps : 0)
      guard let fmt = Self.makeFormatDescription(display, width: Int32(lastWidth > 0 ? lastWidth : 3840), height: Int32(lastHeight > 0 ? lastHeight : 2160)) else {
        clearDisplayCriteria()
        return
      }
      let key = "\(display.rawValue)|\(refreshRate)"
      if Self.activeDisplayCriteriaKey == key, dm.preferredDisplayCriteria != nil { return }
      dm.preferredDisplayCriteria = AVDisplayCriteria(refreshRate: refreshRate, formatDescription: fmt)
      Self.activeDisplayCriteriaKey = key
      NSLog("[MpvPlayerView] preferredDisplayCriteria → %@ @ %.3f fps (source %@)", display.rawValue, refreshRate, source.rawValue)
    }

    private func clearDisplayCriteria() {
      guard let window = criteriaWindow ?? self.window else { return }
      let dm = window.avDisplayManager
      if Self.activeDisplayCriteriaKey != nil || dm.preferredDisplayCriteria != nil {
        dm.preferredDisplayCriteria = nil
        Self.activeDisplayCriteriaKey = nil
        NSLog("[MpvPlayerView] preferredDisplayCriteria cleared")
      }
    }

    private static func normalizeTag(_ v: String?) -> String {
      (v?.lowercased() ?? "").filter { $0.isLetter || $0.isNumber }
    }

    private static func resolveDynamicRange(gamma: String?, primaries: String?, colorMatrix: String?, sigPeak: Double) -> DynamicRange {
      let g = normalizeTag(gamma), p = normalizeTag(primaries), m = normalizeTag(colorMatrix)
      if g.contains("hlg") || g.contains("arib") { return .hlg }
      if g.contains("pq") || g.contains("smpte2084") || g.contains("st2084") || sigPeak > 1.0
        || p.contains("bt2020") || m.contains("bt2020") { return .hdr10 }
      return .sdr
    }

    /// Clamp the requested range to what the connected display actually advertises (avoids requesting an
    /// HDR mode a non-HDR TV can't do → the switch would fail/flicker).
    private static func supported(_ range: DynamicRange) -> DynamicRange {
      let modes = AVPlayer.availableHDRModes
      switch range {
      case .hdr10: return modes.contains(.hdr10) ? .hdr10 : .sdr
      case .hlg: return modes.contains(.hlg) ? .hlg : .sdr
      case .sdr: return .sdr
      }
    }

    private static func makeFormatDescription(_ range: DynamicRange, width: Int32, height: Int32) -> CMVideoFormatDescription? {
      let ext: [CFString: Any]
      switch range {
      case .hdr10:
        ext = [
          kCMFormatDescriptionExtension_ColorPrimaries: kCMFormatDescriptionColorPrimaries_ITU_R_2020,
          kCMFormatDescriptionExtension_TransferFunction: kCMFormatDescriptionTransferFunction_SMPTE_ST_2084_PQ,
          kCMFormatDescriptionExtension_YCbCrMatrix: kCMFormatDescriptionYCbCrMatrix_ITU_R_2020,
        ]
      case .hlg:
        ext = [
          kCMFormatDescriptionExtension_ColorPrimaries: kCMFormatDescriptionColorPrimaries_ITU_R_2020,
          kCMFormatDescriptionExtension_TransferFunction: kCMFormatDescriptionTransferFunction_ITU_R_2100_HLG,
          kCMFormatDescriptionExtension_YCbCrMatrix: kCMFormatDescriptionYCbCrMatrix_ITU_R_2020,
        ]
      case .sdr:
        ext = [
          kCMFormatDescriptionExtension_ColorPrimaries: kCMFormatDescriptionColorPrimaries_ITU_R_709_2,
          kCMFormatDescriptionExtension_TransferFunction: kCMFormatDescriptionTransferFunction_ITU_R_709_2,
          kCMFormatDescriptionExtension_YCbCrMatrix: kCMFormatDescriptionYCbCrMatrix_ITU_R_709_2,
        ]
      }
      var fd: CMVideoFormatDescription?
      let status = CMVideoFormatDescriptionCreate(
        allocator: kCFAllocatorDefault,
        codecType: kCMVideoCodecType_HEVC,
        width: width, height: height,
        extensions: ext as CFDictionary,
        formatDescriptionOut: &fd)
      return status == noErr ? fd : nil
    }
  #endif

  deinit {
    // Close unmounts this view (source→null), so applySource's clear never runs — drop the HDMI link
    // back to SDR here, synchronously while self is still alive (an async-to-main hop would drain after
    // dealloc). Otherwise the TV stays in HDR after you stop an HDR program.
    #if os(tvOS)
      clearDisplayCriteria()
    #endif
    core.dispose()
  }
}
