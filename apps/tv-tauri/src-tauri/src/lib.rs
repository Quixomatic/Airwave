mod mpv;

use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
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
