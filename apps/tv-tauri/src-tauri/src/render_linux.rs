//! Linux X11 host for libmpv.
//!
//! Keep mpv in a dedicated child beneath WebKitGTK so transparent video areas
//! reveal it while HTML chrome remains visible and interactive. The child is
//! unmapped while idle, fills the content area for full playback, and moves to
//! the featured-panel aperture for mini playback without changing Tauri's GTK
//! widget hierarchy.

use gdkx11::x11::xlib;
use gtk::glib::translate::ToGlibPtr;
use gtk::prelude::*;
pub struct LinuxVideoHost {
    display: usize,
    parent_xid: xlib::Window,
    xid: xlib::Window,
}

// The X server reclaims this child when GTK closes its display connection.
// Destroying it from `Drop` would race both GTK teardown and mpv's final use of
// the `wid`, whose state-drop order is intentionally not relied upon here.

impl LinuxVideoHost {
    pub fn xid(&self) -> i64 {
        self.xid as i64
    }

    pub fn show_region(
        &self,
        x: f64,
        y: f64,
        w: f64,
        h: f64,
        win_w: f64,
        win_h: f64,
    ) -> Result<(), String> {
        let display = self.display;
        let parent_xid = self.parent_xid;
        let xid = self.xid;
        gtk::glib::idle_add_once(move || unsafe {
            let display = display as *mut xlib::Display;
            let mut parent: xlib::XWindowAttributes = std::mem::zeroed();
            if xlib::XGetWindowAttributes(display, parent_xid, &mut parent) == 0 {
                log::error!("failed to read Linux video parent geometry");
                return;
            }

            // Browser geometry arrives in CSS pixels while Xlib uses the
            // realized parent-window coordinate space. Deriving the ratio on
            // every move handles GDK scaling and monitor changes without
            // assuming a fixed devicePixelRatio.
            let scale_x = f64::from(parent.width.max(1)) / win_w.max(1.0);
            let scale_y = f64::from(parent.height.max(1)) / win_h.max(1.0);
            xlib::XMoveResizeWindow(
                display,
                xid,
                (x.max(0.0) * scale_x).round() as i32,
                (y.max(0.0) * scale_y).round() as i32,
                (w.max(1.0) * scale_x).round().max(1.0) as u32,
                (h.max(1.0) * scale_y).round().max(1.0) as u32,
            );
            xlib::XMapWindow(display, xid);
            // Keep WebKitGTK above the video host so its transparent video
            // aperture reveals mpv while HTML chrome remains interactive.
            xlib::XLowerWindow(display, xid);
            xlib::XFlush(display);
        });
        Ok(())
    }

    pub fn hide(&self) -> Result<(), String> {
        let display = self.display;
        let xid = self.xid;
        gtk::glib::idle_add_once(move || unsafe {
            let display = display as *mut xlib::Display;
            xlib::XUnmapWindow(display, xid);
            xlib::XFlush(display);
        });
        Ok(())
    }
}

/// Create, but deliberately do not map, the X11 parent passed to libmpv.
pub fn setup(window: &tauri::WebviewWindow) -> Result<LinuxVideoHost, String> {
    let gtk_window = window.gtk_window().map_err(|e| e.to_string())?;
    let gdk_window = gtk_window
        .window()
        .ok_or("Tauri GTK window is not realized")?;
    let x11_parent = gdk_window
        .downcast::<gdkx11::X11Window>()
        .map_err(|_| "Tauri window is not using X11 (GDK_BACKEND must be x11)".to_string())?;
    let parent_xid = x11_parent.xid();

    let gdk_display = gtk::gdk::Display::default().ok_or("GDK has no default display")?;
    let x11_display = gdk_display
        .downcast::<gdkx11::X11Display>()
        .map_err(|_| "Tauri display is not using X11 (GDK_BACKEND must be x11)".to_string())?;
    let display =
        unsafe { gdkx11::ffi::gdk_x11_display_get_xdisplay(x11_display.to_glib_none().0) };
    if display.is_null() {
        return Err("GDK returned a null X11 display".into());
    }

    // Start at 1x1 and unmapped. The frontend explicitly shows the host when
    // entering full/mini playback and hides it again for guide-only routes.
    let xid = unsafe { xlib::XCreateSimpleWindow(display, parent_xid, 0, 0, 1, 1, 0, 0, 0) };
    if xid == 0 {
        return Err("failed to create the Linux mpv X11 host window".into());
    }
    unsafe { xlib::XFlush(display) };

    Ok(LinuxVideoHost {
        display: display as usize,
        parent_xid,
        xid,
    })
}
