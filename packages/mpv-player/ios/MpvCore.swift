import Foundation
import Libmpv
import QuartzCore

/// Events surfaced from the mpv render/event loop up to the Expo view.
protocol MpvCoreDelegate: AnyObject {
  func mpvDidLoad(duration: Double, width: Int, height: Int)
  func mpvFirstFrame()
  func mpvProgress(time: Double)
  func mpvBuffering(_ buffering: Bool)
  func mpvError(_ message: String)
  func mpvEnd(reason: String)
  /// The decoded stream's colorimetry (from mpv's `video-params/*`), surfaced once a frame is decoded so
  /// the view can switch the tvOS HDMI output into HDR10/HLG. On tvOS this is the ONLY path to real HDR —
  /// `target-colorspace-hint` is inert in the avfoundation VO and EDR is iOS-only (per .refs/plezy).
  func mpvColorInfo(gamma: String?, primaries: String?, colorMatrix: String?, fps: Double, sigPeak: Double)
}

/// A focused libmpv wrapper (ported/trimmed from plezy's `MpvPlayerCoreBase`): create → options →
/// `mpv_initialize`, `loadfile … start=<offset>` (the fast ffmpeg-estimated seek), and property
/// observation → delegate events. Renders via the `avfoundation` VO into a caller-supplied layer.
final class MpvCore {
  weak var delegate: MpvCoreDelegate?

  private var mpv: OpaquePointer?
  private let queue = DispatchQueue(label: "mpv-player.core", qos: .userInitiated)
  private var wakeupContext: UnsafeMutableRawPointer?
  private var isDisposing = false
  private var loadedEmitted = false
  private var firstFrameEmitted = false

  // MARK: setup

  /// Create + initialize mpv, rendering into `layer` (its pointer is handed to mpv as `wid`, which the
  /// MPVKit `avfoundation` VO draws into). Extra `options` override the defaults.
  func setup(layer: CALayer, options: [String: String]) -> Bool {
    mpv = mpv_create()
    guard let mpv else { return false }

    // Point the avfoundation VO at our layer.
    var wid = Int64(Int(bitPattern: Unmanaged.passUnretained(layer).toOpaque()))
    checkError(mpv_set_option(mpv, "wid", MPV_FORMAT_INT64, &wid))

    // Defaults (overridable via `options`).
    var opts: [String: String] = [
      "vo": "avfoundation",
      "hwdec": "videotoolbox",
      "hwdec-codecs": "all",
      "target-colorspace-hint": "auto",
      // Keep the last frame at EOF so a seek-back after the program ends still works.
      "keep-open": "yes",
      // Big, forward-biased network cache for smooth LAN direct-play + resilient seeks.
      "cache": "yes",
      "demuxer-max-bytes": "150MiB",
      "demuxer-max-back-bytes": "50MiB",
    ]
    #if targetEnvironment(simulator)
      opts["hwdec"] = "no"
    #endif
    for (k, v) in options { opts[k] = v }
    for (k, v) in opts { checkError(mpv_set_option_string(mpv, k, v)) }

    let rc = mpv_initialize(mpv)
    if rc < 0 {
      mpv_terminate_destroy(mpv)
      self.mpv = nil
      return false
    }

    // Observe the state we surface to JS.
    mpv_observe_property(mpv, 0, "time-pos", MPV_FORMAT_DOUBLE)
    mpv_observe_property(mpv, 0, "duration", MPV_FORMAT_DOUBLE)
    mpv_observe_property(mpv, 0, "width", MPV_FORMAT_INT64)
    mpv_observe_property(mpv, 0, "height", MPV_FORMAT_INT64)
    mpv_observe_property(mpv, 0, "paused-for-cache", MPV_FORMAT_FLAG)

    // Retain self for the (non-retaining) wakeup callback; released in dispose().
    let ctx = Unmanaged.passRetained(self).toOpaque()
    wakeupContext = ctx
    mpv_set_wakeup_callback(mpv, { context in
      guard let context else { return }
      Unmanaged<MpvCore>.fromOpaque(context).takeUnretainedValue().readEvents()
    }, ctx)
    return true
  }

  // MARK: control

  /// Load `url`, opening AT `startTime` seconds (mpv estimates the byte position → a range seek, not a
  /// sequential read from the head). Replaces any current file.
  func load(url: String, startTime: Double) {
    loadedEmitted = false
    firstFrameEmitted = false
    // mpv 0.38+ loadfile signature is `loadfile <url> <flags> <index> <options>` — the `index` arg was
    // inserted before options. It MUST be present (`-1` = default position), or the options string lands
    // in the index slot, the command is malformed, no file loads, and mpv emits ZERO events (silent
    // failure). Matches plezy's `loadfile <uri> replace -1 <options>`.
    var args = ["loadfile", url, "replace", "-1"]
    if startTime > 0 { args.append("start=\(Int(startTime))") }
    command(args)
  }

  func stop() { command(["stop"]) }
  func setPaused(_ paused: Bool) { setProperty("pause", paused ? "yes" : "no") }
  func setMuted(_ muted: Bool) { setProperty("mute", muted ? "yes" : "no") }
  func setVolume(_ volume: Double) { setProperty("volume", String(volume)) }
  func setAudioTrack(_ id: Int) { setProperty("aid", id < 0 ? "no" : String(id)) }
  func setSubtitleTrack(_ id: Int) { setProperty("sid", id < 0 ? "no" : String(id)) }

  /// Absolute seek in seconds. mpv estimates → fast even on un-indexed MKV.
  func seek(_ seconds: Double) { command(["seek", String(seconds), "absolute"]) }

  func dispose() {
    isDisposing = true
    let handle = mpv
    let ctx = wakeupContext
    mpv = nil
    wakeupContext = nil
    queue.async {
      if let handle {
        mpv_set_wakeup_callback(handle, nil, nil)
        mpv_terminate_destroy(handle)
      }
      if let ctx { Unmanaged<MpvCore>.fromOpaque(ctx).release() }
    }
  }

  // MARK: mpv primitives

  private func command(_ args: [String]) {
    guard let mpv else { return }
    var cargs: [UnsafeMutablePointer<CChar>?] = args.map { strdup($0) }
    cargs.append(nil)
    cargs.withUnsafeBufferPointer { buffer in
      // mpv_command wants `const char **` — rebind the strdup'd mutable pointers to const (plezy's pattern).
      var constPointers = buffer.map { $0.map { UnsafePointer($0) } }
      _ = mpv_command(mpv, &constPointers)
    }
    cargs.forEach { free($0) }
  }

  private func setProperty(_ name: String, _ value: String) {
    guard let mpv else { return }
    _ = mpv_set_property_string(mpv, name, value)
  }

  // MARK: event loop

  private func readEvents() {
    queue.async { [weak self] in
      guard let self, !self.isDisposing, let mpv = self.mpv else { return }
      while true {
        guard let ev = mpv_wait_event(mpv, 0) else { break }
        let event = ev.pointee
        if event.event_id == MPV_EVENT_NONE { break }
        self.handle(event)
      }
    }
  }

  private func handle(_ event: mpv_event) {
    switch event.event_id {
    case MPV_EVENT_FILE_LOADED:
      emitLoad()
    case MPV_EVENT_PLAYBACK_RESTART:
      // A frame is now decoded → width/height are guaranteed available. Emit onLoad here too (in case the
      // file-loaded / property-change paths didn't yet have dimensions), then the first-frame signal.
      emitLoad()
      if !firstFrameEmitted {
        firstFrameEmitted = true
        DispatchQueue.main.async { self.delegate?.mpvFirstFrame() }
        // A frame is decoded → the video-params colorimetry is now valid; surface it so the view can
        // switch the tvOS display into HDR for this clip.
        emitColorInfo()
      }
    case MPV_EVENT_END_FILE:
      var reason = "unknown"
      var errMsg: String?
      if let p = event.data?.assumingMemoryBound(to: mpv_event_end_file.self) {
        switch p.pointee.reason {
        case MPV_END_FILE_REASON_EOF: reason = "eof"
        case MPV_END_FILE_REASON_STOP: reason = "stop"
        case MPV_END_FILE_REASON_ERROR:
          reason = "error"
          errMsg = String(cString: mpv_error_string(p.pointee.error))
        case MPV_END_FILE_REASON_REDIRECT: reason = "redirect"
        default: reason = "unknown"
        }
      }
      let r = reason
      let m = errMsg
      DispatchQueue.main.async {
        if let m { self.delegate?.mpvError(m) }
        self.delegate?.mpvEnd(reason: r)
      }
    case MPV_EVENT_PROPERTY_CHANGE:
      guard let data = event.data else { break }
      handleProperty(data.assumingMemoryBound(to: mpv_event_property.self).pointee)
    default:
      break
    }
  }

  private func handleProperty(_ prop: mpv_event_property) {
    let name = String(cString: prop.name)
    switch name {
    case "time-pos":
      if prop.format == MPV_FORMAT_DOUBLE, let d = prop.data?.assumingMemoryBound(to: Double.self).pointee {
        DispatchQueue.main.async { self.delegate?.mpvProgress(time: d) }
      }
    case "paused-for-cache":
      if prop.format == MPV_FORMAT_FLAG, let f = prop.data?.assumingMemoryBound(to: Int32.self).pointee {
        DispatchQueue.main.async { self.delegate?.mpvBuffering(f != 0) }
      }
    case "duration", "width", "height":
      emitLoad()
    default:
      break
    }
  }

  /// Emit onLoad once we have duration + dimensions (from file-loaded or the property observers).
  private func emitLoad() {
    guard let mpv, !loadedEmitted else { return }
    var dur = 0.0, w = Int64(0), h = Int64(0)
    mpv_get_property(mpv, "duration", MPV_FORMAT_DOUBLE, &dur)
    mpv_get_property(mpv, "width", MPV_FORMAT_INT64, &w)
    mpv_get_property(mpv, "height", MPV_FORMAT_INT64, &h)
    guard w > 0, h > 0 else { return }
    loadedEmitted = true
    DispatchQueue.main.async {
      self.delegate?.mpvDidLoad(duration: dur, width: Int(w), height: Int(h))
    }
  }

  /// Read the decoded stream's colorimetry and hand it to the delegate (→ the view's tvOS HDR switch).
  /// Runs on the mpv queue (called from the event handler), so the `mpv_get_property*` calls are safe.
  private func emitColorInfo() {
    let gamma = getString("video-params/gamma")
    let primaries = getString("video-params/primaries")
    let colorMatrix = getString("video-params/colormatrix")
    let fps = getDouble("container-fps")
    let sigPeak = getDouble("video-params/sig-peak")
    DispatchQueue.main.async {
      self.delegate?.mpvColorInfo(gamma: gamma, primaries: primaries, colorMatrix: colorMatrix, fps: fps, sigPeak: sigPeak)
    }
  }

  private func getString(_ name: String) -> String? {
    guard let mpv, let cstr = mpv_get_property_string(mpv, name) else { return nil }
    defer { mpv_free(cstr) }
    let s = String(cString: cstr)
    return s.isEmpty ? nil : s
  }

  private func getDouble(_ name: String) -> Double {
    guard let mpv else { return 0 }
    var d = 0.0
    mpv_get_property(mpv, name, MPV_FORMAT_DOUBLE, &d)
    return d
  }

  private func checkError(_ status: CInt) {
    if status < 0 { print("[MpvCore] error: \(String(cString: mpv_error_string(status)))") }
  }
}
