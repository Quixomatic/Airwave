import AVFoundation
import Foundation
import Libmpv

/// A HEADLESS (no video surface) audio-only libmpv core — for the bumper music bed (§7.14 Phase B) and future
/// audio-only "radio" channels. Ported from plezy's `MpvAudioPlayerCore`: create → set `vid=no` /
/// `audio-display=no` / `force-window=no` → `mpv_initialize`, and **never** wire a `wid`/layer/VO surface.
///
/// Deliberately a SEPARATE class from `MpvCore` (the video path) so the proven video builds stay untouched;
/// it's safe to run as a second, independent mpv instance alongside the video core (plezy confirms this).
/// Driven imperatively (no React view) via the module-level audio functions, which suits both the bumper hook
/// and a radio player.
final class MpvAudioCore {
  /// (currentTime, duration) in seconds, on each `time-pos` tick.
  var onProgress: ((Double, Double) -> Void)?
  /// Natural end of the track (mpv EOF) — NOT our own stop/replace.
  var onEnded: (() -> Void)?
  /// A load/decode/network error (mpv end-file reason = error) — the message.
  var onError: ((String) -> Void)?
  /// Stalled waiting on the network buffer (mpv `paused-for-cache`).
  var onBuffering: ((Bool) -> Void)?

  private var mpv: OpaquePointer?
  private let queue = DispatchQueue(label: "mpv-player.audio", qos: .userInitiated)
  private var wakeupContext: UnsafeMutableRawPointer?
  private var isDisposing = false
  // Our last commanded volume (0..1), so a fade always starts from where the last one left off.
  private var currentVolume: Double = 1.0
  private var fadeTimer: DispatchSourceTimer?

  @discardableResult
  func setup() -> Bool {
    // Play under the video and ignore the ring/silent switch (it's intentional playback, not a UI sound).
    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
    try? AVAudioSession.sharedInstance().setActive(true)

    mpv = mpv_create()
    guard let mpv else { return false }

    // Audio-only, headless. No `wid`, no VO surface — the whole point.
    let opts: [String: String] = [
      "vid": "no",
      "audio-display": "no",
      "force-window": "no",
      "vo": "null",
      "gapless-audio": "weak",
      "keep-open": "yes",
      "cache": "yes",
    ]
    for (k, v) in opts { _ = mpv_set_option_string(mpv, k, v) }

    if mpv_initialize(mpv) < 0 {
      mpv_terminate_destroy(mpv)
      self.mpv = nil
      return false
    }

    mpv_observe_property(mpv, 0, "time-pos", MPV_FORMAT_DOUBLE)
    mpv_observe_property(mpv, 0, "paused-for-cache", MPV_FORMAT_FLAG)

    let ctx = Unmanaged.passRetained(self).toOpaque()
    wakeupContext = ctx
    mpv_set_wakeup_callback(mpv, { context in
      guard let context else { return }
      Unmanaged<MpvAudioCore>.fromOpaque(context).takeUnretainedValue().readEvents()
    }, ctx)
    return true
  }

  // MARK: control

  /// Load `url`, opening AT `startTime` seconds — mpv estimates the byte position (a range seek), so tune-in
  /// mid-track is fast even on a long/un-indexed file, NOT a play-from-0-then-seek. Matches the video core.
  func load(_ url: String, startTime: Double = 0) {
    var args = ["loadfile", url, "replace", "-1"]
    if startTime > 0 { args.append("start=\(Int(startTime))") }
    command(args)
  }
  func play() { setProperty("pause", "no") }
  func pause() { setProperty("pause", "yes") }
  func stop() { command(["stop"]) }
  func seek(_ seconds: Double) { command(["seek", String(seconds), "absolute"]) }
  func setMuted(_ muted: Bool) { setProperty("mute", muted ? "yes" : "no") }
  /// Playback speed (1.0 = normal). mpv `speed`.
  func setRate(_ rate: Double) { setProperty("speed", String(rate)) }

  /// `v` is 0..1 (like an `<audio>` element's volume); mpv's `volume` is 0..100. Cancels any in-flight fade.
  func setVolume(_ v: Double) {
    cancelFade()
    let clamped = max(0, min(1, v))
    currentVolume = clamped
    setProperty("volume", String(clamped * 100))
  }

  /// Smoothly ramp the volume to `target` (0..1) over `durationMs` — a native 60fps ramp of mpv's `volume`,
  /// so it's buttery with a SINGLE bridge call (no per-frame chatter). The primitive for bumper fade in/out
  /// and future radio crossfades. Starts from the current commanded volume; cancels any prior fade.
  func fadeVolume(to target: Double, durationMs: Double) {
    cancelFade()
    let end = max(0, min(1, target))
    let start = currentVolume
    if durationMs <= 0 || abs(end - start) < 0.001 {
      currentVolume = end
      setProperty("volume", String(end * 100))
      return
    }
    let dur = durationMs / 1000.0
    let startTime = DispatchTime.now()
    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(deadline: .now(), repeating: .milliseconds(16))
    timer.setEventHandler { [weak self] in
      guard let self else { return }
      let elapsed = Double(DispatchTime.now().uptimeNanoseconds - startTime.uptimeNanoseconds) / 1_000_000_000
      let t = min(1, elapsed / dur)
      let v = start + (end - start) * t
      self.currentVolume = v
      self.setProperty("volume", String(v * 100))
      if t >= 1 { self.cancelFade() }
    }
    fadeTimer = timer
    timer.resume()
  }

  private func cancelFade() {
    fadeTimer?.cancel()
    fadeTimer = nil
  }

  func setLoop(_ loop: Bool) { setProperty("loop-file", loop ? "inf" : "no") }

  func dispose() {
    isDisposing = true
    cancelFade()
    let handle = mpv
    let ctx = wakeupContext
    mpv = nil
    wakeupContext = nil
    queue.async {
      if let handle {
        mpv_set_wakeup_callback(handle, nil, nil)
        mpv_terminate_destroy(handle)
      }
      if let ctx { Unmanaged<MpvAudioCore>.fromOpaque(ctx).release() }
    }
  }

  // MARK: mpv primitives (trimmed copy of MpvCore's — kept local so the video core stays untouched)

  private func command(_ args: [String]) {
    guard let mpv else { return }
    var cargs: [UnsafeMutablePointer<CChar>?] = args.map { strdup($0) }
    cargs.append(nil)
    cargs.withUnsafeBufferPointer { buffer in
      var constPointers = buffer.map { $0.map { UnsafePointer($0) } }
      _ = mpv_command(mpv, &constPointers)
    }
    cargs.forEach { free($0) }
  }

  private func setProperty(_ name: String, _ value: String) {
    guard let mpv else { return }
    _ = mpv_set_property_string(mpv, name, value)
  }

  private func getDouble(_ name: String) -> Double {
    guard let mpv else { return 0 }
    var d = 0.0
    mpv_get_property(mpv, name, MPV_FORMAT_DOUBLE, &d)
    return d
  }

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
    case MPV_EVENT_END_FILE:
      var eof = false
      var errMsg: String?
      if let p = event.data?.assumingMemoryBound(to: mpv_event_end_file.self) {
        switch p.pointee.reason {
        case MPV_END_FILE_REASON_EOF: eof = true
        case MPV_END_FILE_REASON_ERROR: errMsg = String(cString: mpv_error_string(p.pointee.error))
        default: break
        }
      }
      let m = errMsg
      DispatchQueue.main.async {
        if let m { self.onError?(m) }
        if eof { self.onEnded?() }
      }
    case MPV_EVENT_PROPERTY_CHANGE:
      guard let data = event.data else { break }
      let prop = data.assumingMemoryBound(to: mpv_event_property.self).pointee
      let name = String(cString: prop.name)
      if name == "time-pos",
         prop.format == MPV_FORMAT_DOUBLE,
         let d = prop.data?.assumingMemoryBound(to: Double.self).pointee {
        let dur = getDouble("duration")
        DispatchQueue.main.async { self.onProgress?(d, dur) }
      } else if name == "paused-for-cache",
                prop.format == MPV_FORMAT_FLAG,
                let f = prop.data?.assumingMemoryBound(to: Int32.self).pointee {
        DispatchQueue.main.async { self.onBuffering?(f != 0) }
      }
    default:
      break
    }
  }
}
