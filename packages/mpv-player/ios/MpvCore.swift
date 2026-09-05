import AVFoundation
import Foundation
import Libmpv
import QuartzCore
import os

/// Safely convert an mpv C string to a Swift String. mpv does NOT guarantee UTF-8 for log messages, error
/// strings, or system-encoded paths — validate as UTF-8, else fall back to Latin-1 so we never crash on
/// non-UTF-8 bytes. (Ported from plezy's `MpvPlayerCoreBase.safeString`.)
func mpvSafeString(_ cstr: UnsafePointer<CChar>) -> String {
  if let s = String(validatingUTF8: cstr) { return s }
  let len = strlen(cstr)
  let buf = UnsafeBufferPointer(start: UnsafeRawPointer(cstr).assumingMemoryBound(to: UInt8.self), count: len)
  return String(buf.map { Character(Unicode.Scalar($0)) })
}

/// Events surfaced from the mpv render/event loop up to the Expo view.
protocol MpvCoreDelegate: AnyObject {
  func mpvDidLoad(duration: Double, width: Int, height: Int)
  func mpvFirstFrame()
  func mpvProgress(time: Double, duration: Double)
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
  // Our last commanded volume in mpv units (0..100), so a fade always resumes from where the last left off.
  // The hybrid single-engine model (see .plans/mpv-hybrid-core.md) shares this ONE `volume` property between
  // video (full) and audio-only bumper/radio content (JS-driven fades) — a video load resets it to 100.
  private var currentVolume: Double = 100
  private var fadeTimer: DispatchSourceTimer?

  private let log = Logger(subsystem: "com.airwave.tv", category: "mpv")

  // Async request table (ported from plezy's MpvPlayerCoreBase): every mpv_command_async /
  // mpv_set_property_async submits with a reply id, and the matching MPV_EVENT_*_REPLY drains its completion.
  // The async client API returns IMMEDIATELY (never blocks the caller), so a libmpv call on the MAIN thread
  // can no longer deadlock against the avfoundation VO's dispatch_sync(main). See .plans/mpv-async-refactor.md.
  private var pendingRequests: [UInt64: (Result<Void, Error>) -> Void] = [:]
  private let pendingRequestsLock = NSLock()
  private var nextRequestId: UInt64 = 1

  // MARK: setup

  /// Create + initialize mpv, rendering into `layer` (its pointer is handed to mpv as `wid`, which the
  /// MPVKit `avfoundation` VO draws into). Extra `options` override the defaults.
  func setup(layer: CALayer, options: [String: String]) -> Bool {
    // Configure the shared audio session for long-form video playback BEFORE mpv's audio unit spins up,
    // so it negotiates the real multichannel route (5.1/7.1 LPCM to an AVR/soundbar). Without this, the
    // session stays stereo-capped and mpv's multichannel output gets mangled — the center channel
    // (dialogue) is lost. Re-applied when the AO comes up (see `current-ao` / PLAYBACK_RESTART), because
    // mpv stomps the shared session when its audio unit initializes (streamyfin's hard-won lesson).
    configureAudioSession()

    mpv = mpv_create()
    guard let mpv else { return false }

    // Enable libmpv's own log BEFORE initialize, so a stalled/failing pipeline is diagnosable — verbose in
    // debug, warnings+ on a store build (which `print` never reached). Surfaced via os_log in `handleLogMessage`
    // → visible in Console.app off a retail device. (plezy does this; we had dropped it. GitHub #31.)
    #if DEBUG
      checkError(mpv_request_log_messages(mpv, "v"))
    #else
      checkError(mpv_request_log_messages(mpv, "warn"))
    #endif

    // Point the avfoundation VO at our layer.
    var wid = Int64(Int(bitPattern: Unmanaged.passUnretained(layer).toOpaque()))
    checkError(mpv_set_option(mpv, "wid", MPV_FORMAT_INT64, &wid))

    // Defaults (overridable via `options`).
    var opts: [String: String] = [
      "vo": "avfoundation",
      // Don't composite the OSD (subtitles) onto frames in the VO: our subtitles are burned/selected
      // SERVER-SIDE (Plex PUT ?subtitleStreamID= + transcode), so mpv's OSD isn't our render path. Compositing
      // does per-frame CoreImage work that widens the VO↔main coupling on tvOS. Matches plezy + streamyfin.
      "avfoundation-composite-osd": "no",
      "hwdec": "videotoolbox",
      "hwdec-codecs": "all",
      "target-colorspace-hint": "auto",
      // Use the FULL layout the negotiated audio route reports (real 5.1/7.1), not the timid `auto-safe`
      // default that caps at stereo. On a 2-channel route this still resolves to stereo (mpv folds the
      // center in), so it's correct everywhere. The JS `audioMode` setting overrides this to force stereo.
      "audio-channels": "auto",
      // Keep the last frame at EOF so a seek-back after the program ends still works.
      "keep-open": "yes",
      // Big, forward-biased network cache for smooth LAN direct-play + resilient seeks.
      "cache": "yes",
      "demuxer-max-bytes": "150MiB",
      "demuxer-max-back-bytes": "50MiB",
      // Audio-only capability (bumper music bed + future radio) folded into this ONE engine — harmless to
      // single-file video (there's no playlist to prefetch). `append` + these make radio handoffs gapless.
      "gapless-audio": "weak",
      "prefetch-playlist": "yes",
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
    // When mpv's audio output initializes it re-touches the shared AVAudioSession — re-apply ours so the
    // multichannel long-form route sticks.
    mpv_observe_property(mpv, 0, "current-ao", MPV_FORMAT_STRING)

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
  ///
  /// `mode` is the ONLY place content-type branches (see `.plans/mpv-hybrid-core.md`). Because this is now
  /// ONE shared engine, persistent properties an audio track set (`loop-file`, faded-down `volume`, `speed`)
  /// would otherwise bleed into the next program — so a video load RESETS them, and an audio load starts
  /// SILENT (JS fades the bumper bed in / a radio caller sets its level) + suppresses cover-art-as-video.
  func load(url: String, startTime: Double, mode: String = "video") {
    loadedEmitted = false
    firstFrameEmitted = false
    cancelFade()
    // mpv 0.38+ loadfile signature is `loadfile <url> <flags> <index> <options>` — the `index` arg was
    // inserted before options. It MUST be present (`-1` = default position), or the options string lands
    // in the index slot, the command is malformed, no file loads, and mpv emits ZERO events (silent
    // failure). Matches plezy's `loadfile <uri> replace -1 <options>`. Per-file options are ONE
    // comma-joined arg, and are scoped to THIS file's playback (they persist through seeks, not reloads).
    var fileOpts: [String] = []
    if startTime > 0 { fileOpts.append("start=\(Int(startTime))") }
    if mode == "audio" {
      // Audio-only: never decode a video track or draw an mp3/m4a's embedded cover art to the surface.
      fileOpts.append("vid=no")
      fileOpts.append("audio-display=no")
      // Start silent; the caller (bumper fade / radio) raises the volume. Deterministic regardless of when
      // the view ref is available (a fresh tune that lands straight on a bumper mounts the view mid-load).
      // Set BEFORE the load: the new file inherits silence, and lowering the OUTGOING file can't pop.
      currentVolume = 0
      setProperty("volume", "0")
    }
    var args = ["loadfile", url, "replace", "-1"]
    if !fileOpts.isEmpty { args.append(fileOpts.joined(separator: ",")) }
    command(args)
    if mode != "audio" {
      // Video: undo persistent props audio content may have left on the shared engine — AFTER the loadfile,
      // so raising the volume back to full can't briefly blast the OUTGOING (faded-down) music before it's
      // replaced. mpv applies these to the freshly loaded file well before its first audio buffer, so the
      // program still starts at full volume, un-looped, at normal speed.
      setProperty("loop-file", "no")
      setProperty("speed", "1")
      currentVolume = 100
      setProperty("volume", "100")
    }
  }

  /// Queue `url` AFTER the current track (mpv playlist `append`) for GAPLESS radio playback — with
  /// `prefetch-playlist` the next entry opens before this one ends, so there's no gap. Call after a `load`.
  func append(url: String, startTime: Double) {
    var args = ["loadfile", url, "append", "-1"]
    if startTime > 0 { args.append("start=\(Int(startTime))") }
    command(args)
  }

  func stop() { command(["stop"]) }
  func setPaused(_ paused: Bool) { setProperty("pause", paused ? "yes" : "no") }
  func setMuted(_ muted: Bool) { setProperty("mute", muted ? "yes" : "no") }
  /// Set volume in mpv units (0..100). Cancels any in-flight fade.
  func setVolume(_ volume: Double) {
    cancelFade()
    currentVolume = volume
    setProperty("volume", String(volume))
  }
  func setAudioTrack(_ id: Int) { setProperty("aid", id < 0 ? "no" : String(id)) }
  func setSubtitleTrack(_ id: Int) { setProperty("sid", id < 0 ? "no" : String(id)) }
  /// Audio channel layout: `"auto"` uses the full negotiated route (real 5.1/7.1), `"stereo"` forces a
  /// fold-down. Applied when the audio chain is next (re)initialized, so callers reload the current file.
  func setAudioChannels(_ layout: String) { setProperty("audio-channels", layout) }

  /// Loop the current file at EOF (mpv `loop-file`) — for the ambient bumper bed + looping radio. A video
  /// load resets this to `no`, so it never bleeds into a program.
  func setLoop(_ loop: Bool) { setProperty("loop-file", loop ? "inf" : "no") }
  /// Playback speed (1.0 = normal — mpv `speed`).
  func setRate(_ rate: Double) { setProperty("speed", String(rate)) }

  /// Smoothly ramp the volume to `target` (0..1) over `durationMs` — a native 60fps ramp of mpv's `volume`
  /// (0..100), so it's buttery with a SINGLE bridge call. The primitive for bumper fade in/out. Starts from
  /// the current commanded volume; cancels any prior fade.
  func fadeVolume(to target: Double, durationMs: Double) {
    cancelFade()
    let end = max(0, min(1, target)) * 100
    let start = currentVolume
    if durationMs <= 0 || abs(end - start) < 0.1 {
      currentVolume = end
      setProperty("volume", String(end))
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
      self.setProperty("volume", String(v))
      if t >= 1 { self.cancelFade() }
    }
    fadeTimer = timer
    timer.resume()
  }

  private func cancelFade() {
    fadeTimer?.cancel()
    fadeTimer = nil
  }

  /// Absolute seek in seconds. mpv estimates → fast even on un-indexed MKV.
  func seek(_ seconds: Double) { command(["seek", String(seconds), "absolute"]) }

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
      if let ctx { Unmanaged<MpvCore>.fromOpaque(ctx).release() }
    }
  }

  // MARK: audio session

  /// Put the shared session into long-form video playback so tvOS/iOS negotiates the full multichannel
  /// route to an AVR/soundbar (LPCM 5.1/7.1). `.longFormAudio` is the routing policy Apple designates for
  /// movie/TV playback; `.moviePlayback` mode adds the matching signal processing. Idempotent — safe to
  /// call repeatedly (we re-assert it whenever mpv's audio unit re-touches the session).
  private func configureAudioSession() {
    let session = AVAudioSession.sharedInstance()
    // IDEMPOTENT: no-op when the session is already long-form movie playback. Re-setting the SAME category
    // mid-playback renegotiates the audio route and PAUSES mpv — that's the ~250ms post-bumper re-pause when
    // the bumper-music core (a second libmpv instance) had left the shared session in a different category.
    // Only act when it's genuinely wrong, so re-asserting is always safe to call (setup / current-ao /
    // playback-restart). The music core (`MpvAudioCore`) pins the SAME config, so between them the session
    // never actually changes and this stays a no-op. See `MpvAudioCore.configureAudioSession`.
    if session.category == .playback, session.mode == .moviePlayback, session.routeSharingPolicy == .longFormAudio {
      return
    }
    do {
      try session.setCategory(.playback, mode: .moviePlayback, policy: .longFormAudio, options: [])
      try session.setActive(true)
    } catch {
      log.error("audio session config failed: \(error.localizedDescription, privacy: .public)")
    }
  }

  // MARK: mpv primitives

  // All mutations go through the ASYNC client API (mpv_command_async / mpv_set_property_async). These submit
  // to mpv's internal core and return immediately — they NEVER block the caller — so it's safe to call them
  // from ANY thread, including the main thread (Expo `Prop` setters run there). mpv executes submissions in
  // ORDER on its own core, so the load-then-reset sequence in `load()` still applies in order. Completions are
  // fired when the matching MPV_EVENT_*_REPLY arrives (see `handle`); our callers are fire-and-forget, but the
  // reply path still surfaces any mpv error to os_log. (Ported from plezy's MpvPlayerCoreBase.)

  private func command(_ args: [String]) { commandAsync(args) { _ in } }

  private func commandAsync(_ args: [String], completion: @escaping (Result<Void, Error>) -> Void) {
    guard let mpv, !args.isEmpty else { completion(.success(())); return }
    let requestId = registerRequest(completion)
    var cargs: [UnsafeMutablePointer<CChar>?] = args.map { strdup($0) }
    cargs.append(nil)
    cargs.withUnsafeBufferPointer { buffer in
      // mpv_command_async wants `const char **` — rebind the strdup'd mutable pointers to const (plezy's pattern).
      var constPointers = buffer.map { $0.map { UnsafePointer($0) } }
      let status = mpv_command_async(mpv, requestId, &constPointers)
      completeRequestIfSubmissionFailed(requestId: requestId, status: status)
    }
    cargs.forEach { free($0) }
  }

  private func setProperty(_ name: String, _ value: String) { setPropertyAsync(name, value) { _ in } }

  private func setPropertyAsync(_ name: String, _ value: String, completion: @escaping (Result<Void, Error>) -> Void) {
    guard let mpv else { completion(.success(())); return }
    let requestId = registerRequest(completion)
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

  private func mpvError(_ status: CInt) -> NSError {
    NSError(domain: "mpv", code: Int(status), userInfo: [NSLocalizedDescriptionKey: mpvSafeString(mpv_error_string(status))])
  }

  /// The async submit itself failed (rare — bad args / no core). Fire the completion now; no reply will come.
  private func completeRequestIfSubmissionFailed(requestId: UInt64, status: CInt) {
    guard status < 0, let completion = takeRequest(requestId) else { return }
    let err = mpvError(status)
    DispatchQueue.main.async { completion(.failure(err)) }
  }

  /// Drain a command/set-property reply: log any mpv error (observability), then fire the completion on main.
  private func completeVoidRequest(requestId: UInt64, error status: CInt) {
    if status < 0 {
      log.error("mpv async op failed: \(mpvSafeString(mpv_error_string(status)), privacy: .public)")
    }
    guard let completion = takeRequest(requestId) else { return }
    DispatchQueue.main.async { completion(status < 0 ? .failure(self.mpvError(status)) : .success(())) }
  }

  /// Fail every outstanding completion (called on dispose) so nothing leaks or hangs.
  private func cancelPendingRequests() {
    pendingRequestsLock.lock()
    let pending = pendingRequests
    pendingRequests.removeAll()
    pendingRequestsLock.unlock()
    let err = NSError(domain: "mpv", code: -1, userInfo: [NSLocalizedDescriptionKey: "Player disposed"])
    for (_, completion) in pending { DispatchQueue.main.async { completion(.failure(err)) } }
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
      // The AO is up by now — re-assert our long-form multichannel session (mpv reconfigures the shared
      // session when its audio unit starts, which can drop the route back to stereo).
      configureAudioSession()
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
    case MPV_EVENT_COMMAND_REPLY, MPV_EVENT_SET_PROPERTY_REPLY:
      // Async submit finished — fire its completion (and log any mpv error).
      completeVoidRequest(requestId: event.reply_userdata, error: event.error)
    case MPV_EVENT_LOG_MESSAGE:
      handleLogMessage(event)
    default:
      break
    }
  }

  /// mpv's own log line (level requested in `setup`) → os_log, so a store build's Console.app can answer
  /// "why did the video stop". Runs on the mpv queue (from the event loop). GitHub #31.
  private func handleLogMessage(_ event: mpv_event) {
    guard let p = event.data?.assumingMemoryBound(to: mpv_event_log_message.self) else { return }
    let prefix = p.pointee.prefix.map { mpvSafeString($0) } ?? ""
    let level = p.pointee.level.map { mpvSafeString($0) } ?? ""
    let text = (p.pointee.text.map { mpvSafeString($0) } ?? "").trimmingCharacters(in: .newlines)
    if text.isEmpty { return }
    switch level {
    case "fatal", "error":
      log.error("[\(prefix, privacy: .public)] \(text, privacy: .public)")
    case "warn":
      log.notice("[\(prefix, privacy: .public)] \(text, privacy: .public)")
    default:
      log.debug("[\(prefix, privacy: .public)] \(text, privacy: .public)")
    }
  }

  private func handleProperty(_ prop: mpv_event_property) {
    let name = String(cString: prop.name)
    switch name {
    case "time-pos":
      if prop.format == MPV_FORMAT_DOUBLE, let d = prop.data?.assumingMemoryBound(to: Double.self).pointee {
        // Carry duration too — the audio-only bumper bed derives its loop-position from it (video ignores it).
        let dur = getDouble("duration")
        DispatchQueue.main.async { self.delegate?.mpvProgress(time: d, duration: dur) }
      }
    case "paused-for-cache":
      if prop.format == MPV_FORMAT_FLAG, let f = prop.data?.assumingMemoryBound(to: Int32.self).pointee {
        DispatchQueue.main.async { self.delegate?.mpvBuffering(f != 0) }
      }
    case "current-ao":
      // The audio unit (re)initialized and stomped the shared session — re-apply the long-form
      // multichannel category so the receiver keeps getting real 5.1/7.1.
      DispatchQueue.main.async { self.configureAudioSession() }
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
    if status < 0 { log.error("error: \(mpvSafeString(mpv_error_string(status)), privacy: .public)") }
  }
}
