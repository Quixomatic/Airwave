import Foundation
import Libmpv
import os

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

  private let log = Logger(subsystem: "com.airwave.tv", category: "mpv-audio")

  // Async request table — same as MpvCore (see .plans/mpv-async-refactor.md). Keeps this headless core off the
  // synchronous client API too, for parity and so it's safe to call from any thread.
  private var pendingRequests: [UInt64: (Result<Void, Error>) -> Void] = [:]
  private let pendingRequestsLock = NSLock()
  private var nextRequestId: UInt64 = 1

  @discardableResult
  func setup() -> Bool {
    // SESSION-PASSIVE: this headless bumper-music core NEVER touches the shared AVAudioSession. The app
    // configures it ONCE at launch (see `MpvPlayerModule` OnCreate) and the video core owns it; a second
    // libmpv instance poking the session on setup/teardown was what flipped it out from under the video
    // (post-bumper re-pause + lost 5.1). We just play through the app's session.

    mpv = mpv_create()
    guard let mpv else { return false }

    // libmpv log → os_log (verbose debug / warnings on a store build). GitHub #31.
    #if DEBUG
      _ = mpv_request_log_messages(mpv, "v")
    #else
      _ = mpv_request_log_messages(mpv, "warn")
    #endif

    // Audio-only, headless. No `wid`, no VO surface — the whole point.
    let opts: [String: String] = [
      "vid": "no",
      "audio-display": "no",
      "force-window": "no",
      "vo": "null",
      // Claim the FULL negotiated output layout, exactly like the video core — NOT mpv's stereo-capped
      // default. So both engines negotiate the shared output the same way, and the (stereo) music bed
      // doesn't clamp the output to 2 channels and steal the video's 5.1/7.1.
      "audio-channels": "auto",
      "gapless-audio": "weak",
      // Open the next queued playlist entry BEFORE the current one ends — the trick that makes an
      // `append`ed network track truly gapless (no "opening the next file" pause at the boundary).
      "prefetch-playlist": "yes",
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

  /// Queue `url` AFTER the current track (mpv playlist `append`) for GAPLESS radio playback — mpv auto-advances
  /// the playlist and, with `prefetch-playlist`, opens the next entry before the current ends → no gap. Call
  /// after a `load` (the first track plays now; appended ones follow). Optional `startTime` tunes the appended
  /// entry mid-track (radio DVR).
  func append(_ url: String, startTime: Double = 0) {
    var args = ["loadfile", url, "append", "-1"]
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
    cancelPendingRequests()
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

  // Async client API (see MpvCore / .plans/mpv-async-refactor.md) — non-blocking submits, replies drained in `handle`.

  private func command(_ args: [String]) {
    guard let mpv, !args.isEmpty else { return }
    let requestId = registerRequest { _ in }
    var cargs: [UnsafeMutablePointer<CChar>?] = args.map { strdup($0) }
    cargs.append(nil)
    cargs.withUnsafeBufferPointer { buffer in
      var constPointers = buffer.map { $0.map { UnsafePointer($0) } }
      let status = mpv_command_async(mpv, requestId, &constPointers)
      completeRequestIfSubmissionFailed(requestId: requestId, status: status)
    }
    cargs.forEach { free($0) }
  }

  private func setProperty(_ name: String, _ value: String) {
    guard let mpv else { return }
    let requestId = registerRequest { _ in }
    let status = name.withCString { namePtr in
      value.withCString { valuePtr in
        var propertyValue: UnsafePointer<CChar>? = valuePtr
        return mpv_set_property_async(mpv, requestId, namePtr, MPV_FORMAT_STRING, &propertyValue)
      }
    }
    completeRequestIfSubmissionFailed(requestId: requestId, status: status)
  }

  // MARK: async request table

  private func registerRequest(_ completion: @escaping (Result<Void, Error>) -> Void) -> UInt64 {
    pendingRequestsLock.lock()
    defer { pendingRequestsLock.unlock() }
    let id = nextRequestId
    nextRequestId += 1
    pendingRequests[id] = completion
    return id
  }

  private func takeRequest(_ id: UInt64) -> ((Result<Void, Error>) -> Void)? {
    pendingRequestsLock.lock()
    defer { pendingRequestsLock.unlock() }
    return pendingRequests.removeValue(forKey: id)
  }

  private func completeRequestIfSubmissionFailed(requestId: UInt64, status: CInt) {
    guard status < 0, let completion = takeRequest(requestId) else { return }
    DispatchQueue.main.async { completion(.failure(NSError(domain: "mpv", code: Int(status)))) }
  }

  private func completeVoidRequest(requestId: UInt64, error status: CInt) {
    if status < 0 { log.error("mpv async op failed: \(mpvSafeString(mpv_error_string(status)), privacy: .public)") }
    guard let completion = takeRequest(requestId) else { return }
    DispatchQueue.main.async { completion(status < 0 ? .failure(NSError(domain: "mpv", code: Int(status))) : .success(())) }
  }

  private func cancelPendingRequests() {
    pendingRequestsLock.lock()
    let pending = pendingRequests
    pendingRequests.removeAll()
    pendingRequestsLock.unlock()
    let err = NSError(domain: "mpv", code: -1)
    for (_, completion) in pending { DispatchQueue.main.async { completion(.failure(err)) } }
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
    case MPV_EVENT_COMMAND_REPLY, MPV_EVENT_SET_PROPERTY_REPLY:
      completeVoidRequest(requestId: event.reply_userdata, error: event.error)
    case MPV_EVENT_LOG_MESSAGE:
      guard let p = event.data?.assumingMemoryBound(to: mpv_event_log_message.self) else { break }
      let prefix = p.pointee.prefix.map { mpvSafeString($0) } ?? ""
      let level = p.pointee.level.map { mpvSafeString($0) } ?? ""
      let text = (p.pointee.text.map { mpvSafeString($0) } ?? "").trimmingCharacters(in: .newlines)
      if text.isEmpty { break }
      if level == "fatal" || level == "error" {
        log.error("[\(prefix, privacy: .public)] \(text, privacy: .public)")
      } else if level == "warn" {
        log.notice("[\(prefix, privacy: .public)] \(text, privacy: .public)")
      } else {
        log.debug("[\(prefix, privacy: .public)] \(text, privacy: .public)")
      }
    default:
      break
    }
  }
}
