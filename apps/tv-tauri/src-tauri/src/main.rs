// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// mpv's `wid` embedding API needs an X11 window id. Select GTK's X11 backend before Tauri/GTK is
/// initialized; on a Wayland desktop this makes the app use XWayland while preserving the native
/// Wayland session for every other application.
#[cfg(target_os = "linux")]
fn configure_linux_display_backend() {
    if std::env::var_os("DISPLAY").is_none() {
        eprintln!(
            "Airwave requires an X11 display for embedded video. Native Wayland is not supported by \
             mpv --wid; enable XWayland and ensure DISPLAY is set."
        );
        std::process::exit(1);
    }

    let wayland_session = std::env::var_os("WAYLAND_DISPLAY").is_some();
    let requested_backend = std::env::var_os("GDK_BACKEND");
    if requested_backend.as_deref() != Some(std::ffi::OsStr::new("x11")) {
        if let Some(backend) = requested_backend {
            eprintln!(
                "Airwave: overriding GDK_BACKEND={} with x11 for libmpv embedding.",
                backend.to_string_lossy()
            );
        } else if wayland_session {
            eprintln!("Airwave: Wayland session detected; using XWayland for libmpv embedding.");
        }

        std::env::set_var("GDK_BACKEND", "x11");
    }

    // WebKitGTK's DMA-BUF renderer can try to allocate GBM buffers for the XWayland window and
    // fail on otherwise valid Wayland/driver combinations. Force its shared-memory transport,
    // which keeps accelerated compositing and the transparent UI without using the GBM path.
    // Honor an explicit user value so DMA-BUF can still be tested on known-good systems.
    if wayland_session && std::env::var_os("WEBKIT_DMABUF_RENDERER_FORCE_SHM").is_none() {
        std::env::set_var("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1");
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    configure_linux_display_backend();

    app_lib::run();
}
