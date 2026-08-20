mod mpv;

use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use tauri::Manager;
use tauri_plugin_http::reqwest;

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
        .invoke_handler(tauri::generate_handler![local_subnets, probe_health, api_request])
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

    let mpv = mpv::Mpv::new()?;
    // `wid` is a pre-init option — set it, then initialize.
    mpv.set_option_string("hwdec", "auto")?; // hardware decode (soia baseline)
    mpv.set_option_i64("wid", hwnd as i64)?;
    mpv.initialize()?;

    // mpv stays IDLE (attached, initialized, ready) — no autoplay, so it doesn't
    // burn GPU during development. Tune-in (Phase 4) calls loadfile. Pass a file/URL
    // as the first CLI arg to manually test playback (compositing already proven).
    match std::env::args().nth(1) {
        Some(src) => {
            mpv.loadfile(&src)?;
            log::info!("mpv attached (wid={hwnd}) + loadfile {src}");
        }
        None => log::info!("mpv attached (wid={hwnd}) — idle (pass a file/URL arg to test playback)"),
    }

    app.manage(mpv); // keep the handle alive for the app's lifetime
    Ok(())
}
