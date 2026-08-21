mod mpv;

use std::sync::Arc;

use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use tauri::{Emitter, Manager, State};
use tauri_plugin_http::reqwest;

// ── The mpv player command surface (Phase 4) ───────────────────────────────
// The single full-window mpv instance is created in `setup_player` and shared as `Arc<Mpv>` app
// state; these commands drive it from JS, mirroring tv-native's `@airwave/mpv-player` contract
// (load / play-pause / seek / track select / stop). Playback status flows the other way as Tauri
// events emitted by the event-loop thread (see `spawn_mpv_event_loop`).

/// Load a URL and open AT `start_at` seconds (mpv's `start=` = a fast byte-range seek, not
/// play-from-0-then-seek). `start_at <= 0` opens from the beginning.
#[tauri::command]
fn mpv_load(mpv: State<'_, Arc<mpv::Mpv>>, url: String, start_at: f64) -> Result<(), String> {
    if start_at > 0.0 {
        mpv.command(&["loadfile", &url, "replace", "0", &format!("start={start_at}")])
    } else {
        mpv.command(&["loadfile", &url, "replace"])
    }
}

#[tauri::command]
fn mpv_set_pause(mpv: State<'_, Arc<mpv::Mpv>>, paused: bool) -> Result<(), String> {
    mpv.set_property_flag("pause", paused)
}

/// Absolute seek, in seconds (mpv estimates the byte position → fast even on un-indexed MKV).
#[tauri::command]
fn mpv_seek(mpv: State<'_, Arc<mpv::Mpv>>, seconds: f64) -> Result<(), String> {
    mpv.command(&["seek", &seconds.to_string(), "absolute"])
}

/// Select the audio track by mpv `aid` (a track id string, or `"auto"`/`"no"`).
#[tauri::command]
fn mpv_set_audio_track(mpv: State<'_, Arc<mpv::Mpv>>, aid: String) -> Result<(), String> {
    mpv.set_property_string("aid", &aid)
}

/// Select the subtitle track by mpv `sid` (a track id string, or `"no"` to disable).
#[tauri::command]
fn mpv_set_subtitle_track(mpv: State<'_, Arc<mpv::Mpv>>, sid: String) -> Result<(), String> {
    mpv.set_property_string("sid", &sid)
}

#[tauri::command]
fn mpv_stop(mpv: State<'_, Arc<mpv::Mpv>>) -> Result<(), String> {
    mpv.command(&["stop"])
}

/// Render the video into a sub-rectangle of the window — the guide's featured-panel slot — for the
/// MINI FEED. The single full-window mpv surface stays put; `video-margin-ratio-*` scales the video
/// into `(x,y,w,h)` (physical px within a `win_w`×`win_h` window). The guide punches only that slot
/// transparent, so the positioned video shows there and the black margins are covered by the opaque
/// guide. No child HWND, so no airspace problem — it builds on the proven full-window compositing.
#[tauri::command]
fn mpv_set_region(
    mpv: State<'_, Arc<mpv::Mpv>>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    win_w: f64,
    win_h: f64,
) -> Result<(), String> {
    let (ww, wh) = (win_w.max(1.0), win_h.max(1.0));
    let left = (x / ww).clamp(0.0, 1.0);
    let right = ((ww - x - w) / ww).clamp(0.0, 1.0);
    let top = (y / wh).clamp(0.0, 1.0);
    let bottom = ((wh - y - h) / wh).clamp(0.0, 1.0);
    mpv.set_property_double("video-margin-ratio-left", left)?;
    mpv.set_property_double("video-margin-ratio-right", right)?;
    mpv.set_property_double("video-margin-ratio-top", top)?;
    mpv.set_property_double("video-margin-ratio-bottom", bottom)?;
    Ok(())
}

/// Reset the video to fill the whole window (fullscreen player) — clears the mini-feed margins.
#[tauri::command]
fn mpv_fill_window(mpv: State<'_, Arc<mpv::Mpv>>) -> Result<(), String> {
    for p in [
        "video-margin-ratio-left",
        "video-margin-ratio-right",
        "video-margin-ratio-top",
        "video-margin-ratio-bottom",
    ] {
        mpv.set_property_double(p, 0.0)?;
    }
    Ok(())
}

/// Pre-fullscreen prep (soia's cross-OS recipe). Windows glitches going fullscreen straight from a
/// MAXIMIZED window, so the JS `toggleFullscreen` calls this first to unmaximize; the returned bool
/// tells it to re-maximize on exit. No-op (returns false) on macOS/Linux, where Tauri's
/// `setFullscreen` handles any prior window state cleanly. Async so it runs off the main thread (a
/// sync command would block the event loop the unmaximize needs).
#[tauri::command]
async fn prepare_window_for_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        if !window.is_maximized().unwrap_or(false) {
            return Ok(false);
        }
        window.unmaximize().map_err(|e| e.to_string())?;
        Ok(true)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
        Ok(false)
    }
}

/// The mpv event-loop thread: observe the properties the player UI needs and forward every change as
/// a Tauri event (`mpv:*`). Routes property changes on `reply_userdata` (the id we passed to
/// `observe_property`) rather than parsing the event payload union. Ends on mpv shutdown.
fn spawn_mpv_event_loop(app: tauri::AppHandle, mpv: Arc<mpv::Mpv>) {
    use mpv::MpvFormat;
    let _ = mpv.observe_property(1, "time-pos", MpvFormat::Double);
    let _ = mpv.observe_property(2, "pause", MpvFormat::Flag);
    let _ = mpv.observe_property(3, "duration", MpvFormat::Double);
    let _ = mpv.observe_property(4, "core-idle", MpvFormat::Flag);
    let _ = mpv.observe_property(5, "eof-reached", MpvFormat::Flag);

    std::thread::spawn(move || loop {
        let (id, _err, reply) = mpv.poll_event(1.0);
        if id == mpv::MPV_EVENT_SHUTDOWN {
            break;
        }
        if id == mpv::MPV_EVENT_PROPERTY_CHANGE {
            match reply {
                1 => {
                    if let Some(t) = mpv.get_property_double("time-pos") {
                        let _ = app.emit("mpv:time-pos", t);
                    }
                }
                2 => {
                    if let Some(p) = mpv.get_property_flag("pause") {
                        let _ = app.emit("mpv:pause", p);
                    }
                }
                3 => {
                    if let Some(d) = mpv.get_property_double("duration") {
                        let _ = app.emit("mpv:duration", d);
                    }
                }
                4 => {
                    if let Some(idle) = mpv.get_property_flag("core-idle") {
                        let _ = app.emit("mpv:idle", idle);
                    }
                }
                5 => {
                    if mpv.get_property_flag("eof-reached") == Some(true) {
                        let _ = app.emit("mpv:eof", ());
                    }
                }
                _ => {}
            }
        } else if id == mpv::MPV_EVENT_FILE_LOADED {
            let payload = serde_json::json!({
                "width": mpv.get_property_i64("dwidth").unwrap_or(0),
                "height": mpv.get_property_i64("dheight").unwrap_or(0),
                "duration": mpv.get_property_double("duration").unwrap_or(0.0),
            });
            let _ = app.emit("mpv:loaded", payload);
        } else if id == mpv::MPV_EVENT_END_FILE {
            let _ = app.emit("mpv:end", ());
        }
    });
}

/// Probe a batch of candidate base URLs for an Airwave server — `GET {base}/api/health` must answer
/// `{ "ok": true }`. Returns the bases that responded. Runs in Rust (reqwest, re-exported by
/// tauri-plugin-http) so it's NOT subject to the webview's HTTP scope or CORS — this app connects to
/// an arbitrary, user-provided self-hosted address (a bare LAN IP), which the webview scope can't
/// express. Used by both the onboarding LAN scan and the manual "Connect" check.
#[tauri::command]
async fn probe_health(urls: Vec<String>) -> Vec<String> {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(1200))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            log::error!("probe_health: client build failed: {e}");
            return Vec::new();
        }
    };
    // All probes in-flight concurrently (join_all) — a 254-host sweep must not be serial.
    let probes = urls.into_iter().map(|base| {
        let client = client.clone();
        async move {
            let url = format!("{base}/api/health");
            match client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    // reqwest's `.json()` needs its `json` feature (off on the re-export), so read
                    // text and parse with serde_json (already a dep). Health = `{ "ok": true }`.
                    match resp.text().await {
                        Ok(text) => match serde_json::from_str::<serde_json::Value>(&text) {
                            Ok(v) if v.get("ok").and_then(|b| b.as_bool()) == Some(true) => Some(base),
                            _ => None,
                        },
                        Err(_) => None,
                    }
                }
                _ => None,
            }
        }
    });
    futures::future::join_all(probes)
        .await
        .into_iter()
        .flatten()
        .collect()
}

#[derive(serde::Serialize)]
struct ProbeResult {
    decoded: bool,
    width: i64,
    height: i64,
    audio: bool,
    error: Option<String>,
}

/// Decode-probe a single caps-matrix clip in a THROWAWAY headless mpv instance (fresh per clip, like
/// tv-native): load the URL with no window / no audio output, software-decode, then wait for a decoded
/// frame's dimensions (`dwidth`/`dheight` > 0) or an end-file error, with a hard timeout. Mirrors
/// tv-native's "decoded === real dims > 0" signal. Software decode is a safe LOWER BOUND on what the
/// device plays (real playback also uses gpu-next + hwdec); the server transcodes anything undecodable.
/// Runs on a blocking thread so the synchronous mpv wait doesn't stall the async runtime.
#[tauri::command]
async fn mpv_probe(url: String, timeout_ms: u64) -> ProbeResult {
    tauri::async_runtime::spawn_blocking(move || probe_blocking(&url, timeout_ms))
        .await
        .unwrap_or_else(|_| ProbeResult {
            decoded: false,
            width: 0,
            height: 0,
            audio: false,
            error: Some("probe task failed".into()),
        })
}

fn probe_blocking(url: &str, timeout_ms: u64) -> ProbeResult {
    let fail = |msg: String| ProbeResult {
        decoded: false,
        width: 0,
        height: 0,
        audio: false,
        error: Some(msg),
    };
    let mpv = match mpv::Mpv::new() {
        Ok(m) => m,
        Err(e) => return fail(format!("mpv create: {e}")),
    };
    // Headless software-decode probe — override the visible instance's gpu-next baseline.
    for (k, v) in [("vo", "null"), ("ao", "null"), ("hwdec", "no"), ("keep-open", "no")] {
        if let Err(e) = mpv.set_option_string(k, v) {
            return fail(format!("set {k}: {e}"));
        }
    }
    if let Err(e) = mpv.initialize() {
        return fail(format!("init: {e}"));
    }
    if let Err(e) = mpv.loadfile(url) {
        return fail(format!("loadfile: {e}"));
    }

    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
    let mut audio = false;
    let check_audio = |m: &mpv::Mpv| {
        m.get_property_i64("aid").map(|a| a > 0).unwrap_or(false)
            || m.get_property_string("audio-codec").is_some()
    };
    loop {
        if std::time::Instant::now() >= deadline {
            return fail("timeout (no frame)".into());
        }
        let (id, err) = mpv.wait_event(0.1);
        if id == mpv::MPV_EVENT_END_FILE && err < 0 {
            return fail(format!("end-file error {err}"));
        }
        if id == mpv::MPV_EVENT_FILE_LOADED {
            audio = check_audio(&mpv);
        }
        let dw = mpv.get_property_i64("dwidth").unwrap_or(0);
        let dh = mpv.get_property_i64("dheight").unwrap_or(0);
        if dw > 0 && dh > 0 {
            return ProbeResult {
                decoded: true,
                width: dw,
                height: dh,
                audio: audio || check_audio(&mpv),
                error: None,
            };
        }
    }
}

/// Reachability probe for the Plex connection selection (local→remote→relay): GET the URL with a
/// short timeout, return whether it responded at all (any status). Runs in Rust (reqwest) since the
/// app streams DIRECTLY from arbitrary Plex connection URLs, which the webview CORS/mixed-content can't.
#[tauri::command]
async fn probe_reachable(url: String, timeout_ms: u64) -> bool {
    match reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout_ms))
        .build()
    {
        Ok(client) => client.get(&url).send().await.is_ok(),
        Err(_) => false,
    }
}

/// A pooled reqwest client for all Airwave API calls (connection reuse across requests).
fn http_client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

#[derive(serde::Deserialize)]
struct ApiRequest {
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
}

#[derive(serde::Serialize)]
struct ApiResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
}

/// The single chokepoint for ALL Airwave server HTTP — the JS `apiFetch` routes every request
/// (REST `/api/v1`, the Plex device-link, better-auth) through here. Runs in Rust (reqwest) so it's
/// free of the webview's CORS, its HTTP-scope allowlist, AND the mixed-content block (the packaged app
/// is a secure context, so a webview `fetch` to a plain-`http://` LAN server would be refused).
#[tauri::command]
async fn api_request(req: ApiRequest) -> Result<ApiResponse, String> {
    let method =
        reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes()).map_err(|e| e.to_string())?;
    let mut rb = http_client().request(method, &req.url);
    for (k, v) in &req.headers {
        rb = rb.header(k.as_str(), v.as_str());
    }
    if let Some(b) = req.body {
        rb = rb.body(b);
    }
    let resp = rb.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let headers = resp
        .headers()
        .iter()
        .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    Ok(ApiResponse { status, headers, body })
}

/// LAN discovery for onboarding — return the /24 prefixes (e.g. `"192.168.1"`) of this machine's
/// private IPv4 interfaces, so the setup screen can sweep them for Airwave servers answering
/// `/api/health`. On desktop we read the real interfaces natively: the webview's WebRTC subnet
/// trick that tv-web uses gets mDNS-obfuscated inside WebView2, so it can't see the subnet.
#[tauri::command]
fn local_subnets() -> Vec<String> {
    let mut prefixes: Vec<String> = Vec::new();
    match if_addrs::get_if_addrs() {
        Ok(ifaces) => {
            for iface in ifaces {
                let ip = iface.ip();
                log::info!("local_subnets: iface {} -> {} (loopback={})", iface.name, ip, iface.is_loopback());
                if iface.is_loopback() {
                    continue;
                }
                if let std::net::IpAddr::V4(v4) = ip {
                    let o = v4.octets();
                    // Private ranges only: 10/8, 172.16/12, 192.168/16 (skip link-local 169.254).
                    let is_private = o[0] == 10
                        || (o[0] == 172 && (16..=31).contains(&o[1]))
                        || (o[0] == 192 && o[1] == 168);
                    if !is_private {
                        continue;
                    }
                    let prefix = format!("{}.{}.{}", o[0], o[1], o[2]);
                    if !prefixes.contains(&prefix) {
                        prefixes.push(prefix);
                    }
                }
            }
        }
        Err(e) => log::error!("local_subnets: get_if_addrs failed: {e}"),
    }
    log::info!("local_subnets: prefixes = {prefixes:?}");
    prefixes
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Log plugin first so it captures everything (Rust `log::*` + JS `@tauri-apps/plugin-log`)
        // to the terminal running `tauri dev`. Registered unconditionally so JS logging works.
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            local_subnets,
            probe_health,
            probe_reachable,
            api_request,
            mpv_probe,
            mpv_load,
            mpv_set_pause,
            mpv_seek,
            mpv_set_audio_track,
            mpv_set_subtitle_track,
            mpv_stop,
            mpv_set_region,
            mpv_fill_window,
            prepare_window_for_fullscreen
        ])
        .setup(|app| {
            if let Err(e) = setup_player(app) {
                log::error!("mpv setup failed: {e}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Phase 1 spike: attach mpv to the window and play a test source, following
/// soia's proven pattern — transparent webview (so the UI composites over the
/// video via WebView2/DComp) + the native window handle + a `wid` embed (the
/// one piece we do ourselves in place of soia's closed `soia_utils`).
fn setup_player(app: &mut tauri::App) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("no main window")?;

    // Transparent webview so the video shows behind the UI. NOT window
    // transparency — just the webview background (soia app_bootstrap.rs).
    #[cfg(target_os = "windows")]
    {
        let _ = window.set_background_color(Some(tauri::utils::config::Color(0, 0, 0, 0)));
    }

    // Native window handle for the mpv `--wid` embed.
    let hwnd = match window
        .window_handle()
        .map_err(|e| e.to_string())?
        .as_raw()
    {
        RawWindowHandle::Win32(h) => h.hwnd.get(),
        other => return Err(format!("unsupported window handle: {other:?}")),
    };

    let mpv = Arc::new(mpv::Mpv::new()?);
    // `wid` is a pre-init option — set it, then initialize.
    mpv.set_option_string("hwdec", "auto")?; // hardware decode (soia baseline)
    mpv.set_option_i64("wid", hwnd as i64)?;
    mpv.initialize()?;

    // mpv stays IDLE (attached, initialized, ready) — no autoplay. The watch route drives it via the
    // `mpv_*` commands; playback status flows back as `mpv:*` Tauri events from the loop below. Pass a
    // file/URL as the first CLI arg to manually test playback.
    if let Some(src) = std::env::args().nth(1) {
        mpv.loadfile(&src)?;
        log::info!("mpv attached (wid={hwnd}) + loadfile {src}");
    } else {
        log::info!("mpv attached (wid={hwnd}) — idle");
    }

    spawn_mpv_event_loop(app.handle().clone(), mpv.clone());
    app.manage(mpv); // keep the handle alive + expose it to the mpv_* commands
    Ok(())
}
