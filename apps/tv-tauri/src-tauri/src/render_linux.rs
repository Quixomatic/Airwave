//! Linux video embedding via mpv's **render API** (soia's architecture; plezy's open GL recipe),
//! mirroring `render_macos.rs`.
//!
//! Like macOS — and UNLIKE Windows — we do NOT hand mpv a `wid`. mpv never owns a window here. Instead
//! we run `vo=libmpv`, insert a GTK `GLArea` BEHIND the transparent WebKitGTK webview (via a `GtkOverlay`),
//! create an `mpv_render_context` (OpenGL), and render each mpv frame into the GLArea's framebuffer. GTK/GDK
//! owns the actual GL (EGL) context, so this is windowing-agnostic and works on Wayland natively (and under
//! XWayland). The Wayland/X11 *display* handle is passed to the render context ONLY for VAAPI hw-decode, not
//! for output.
//!
//! ⚠️ UNVALIDATED on hardware. The mpv-render half is a direct translation of plezy
//! (`.refs/plezy/linux/runner/mpv/`); the GLArea-behind-webview compositing is the part that needs on-device
//! iteration (Omarchy/Hyprland/Wayland). Two risk points are flagged inline: (1) reparenting Tauri's GTK
//! child into a GtkOverlay, and (2) reading the GLArea's bound FBO id. See `.plans/tv-tauri-linux-render.md`.

use std::os::raw::{c_char, c_int, c_void};
use std::ptr;
use std::sync::atomic::{AtomicPtr, Ordering};
use std::sync::Arc;

use gtk::glib::translate::ToGlibPtr;
use gtk::prelude::*;

use crate::mpv::{self, ffi};

// ── GL proc resolution (libepoxy directly) ───────────────────────────────────
// GTK links libepoxy; we dlopen it and use `epoxy_get_proc_address` to resolve GL symbols for mpv and for
// our own glGetIntegerv. (We do NOT use the `epoxy` crate — its 0.1.0 pins a gl_generator that depends on a
// yanked xml-rs and won't build.)
type EpoxyGetProc = unsafe extern "C" fn(*const c_char) -> *mut c_void;
static EPOXY_GET_PROC: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());

fn resolve(name: *const c_char) -> *mut c_void {
    let p = EPOXY_GET_PROC.load(Ordering::Relaxed);
    if p.is_null() {
        return ptr::null_mut();
    }
    let f: EpoxyGetProc = unsafe { std::mem::transmute(p) };
    unsafe { f(name) }
}

// mpv resolves each GL symbol it needs through this (whatever context GDK created — EGL on Wayland).
extern "C" fn get_proc_address(_ctx: *mut c_void, name: *const c_char) -> *mut c_void {
    resolve(name)
}

// The live mpv render context, so the GLArea's `render` closure (main thread) can draw with it. Only ever
// touched on the GTK main thread after setup; stored as a raw pointer so the closures can capture it Copy.
static RENDER_CTX: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());

/// Loaded once: `glGetIntegerv`, so we can read the FBO id GTK bound before calling our `render` closure.
type GlGetIntegerv = extern "C" fn(pname: c_int, params: *mut c_int);
static GL_GET_INTEGERV: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());
const GL_DRAW_FRAMEBUFFER_BINDING: c_int = 0x8CA6;

fn current_fbo() -> c_int {
    let f = GL_GET_INTEGERV.load(Ordering::Relaxed);
    if f.is_null() {
        return 0;
    }
    // SAFETY: `f` is `glGetIntegerv` resolved via epoxy; called on the GTK render (main) thread.
    let get: GlGetIntegerv = unsafe { std::mem::transmute(f) };
    let mut fbo: c_int = 0;
    get(GL_DRAW_FRAMEBUFFER_BINDING, &mut fbo);
    fbo
}

/// Render one mpv frame into the framebuffer GTK bound for this `GLArea::render` pass. Runs on the GTK main
/// thread inside the `render` signal.
fn render(area: &gtk::GLArea) {
    let ctx = RENDER_CTX.load(Ordering::Acquire);
    if ctx.is_null() {
        return;
    }
    let scale = area.scale_factor().max(1);
    let w = area.allocated_width() * scale;
    let h = area.allocated_height() * scale;
    if w <= 0 || h <= 0 {
        return;
    }
    let mut fbo = ffi::MpvOpenglFbo {
        fbo: current_fbo(),
        w,
        h,
        internal_format: 0, // SDR 8-bit for now; RGBA16F HDR passthrough is a later pass (see macOS).
    };
    // GTK's GLArea framebuffer is already top-left origin like mpv expects, so no Y-flip (plezy uses 0 too).
    let mut flip: c_int = 0;
    let mut params = [
        ffi::MpvRenderParam {
            type_: ffi::MPV_RENDER_PARAM_OPENGL_FBO,
            data: &mut fbo as *mut _ as *mut c_void,
        },
        ffi::MpvRenderParam {
            type_: ffi::MPV_RENDER_PARAM_FLIP_Y,
            data: &mut flip as *mut _ as *mut c_void,
        },
        ffi::MpvRenderParam {
            type_: ffi::MPV_RENDER_PARAM_INVALID,
            data: ptr::null_mut(),
        },
    ];
    unsafe { ffi::mpv_render_context_render(ctx, params.as_mut_ptr()) };
}

/// mpv's render-update callback — fires (possibly off the GTK thread) when a new frame is ready. We must
/// NOT touch GTK from here; bounce to the main loop and `queue_render`. `data` is the leaked GLArea ptr's
/// weak-ish handle via a channel sender (see setup). Kept minimal: it just wakes the main loop.
extern "C" fn on_update(data: *mut c_void) {
    if data.is_null() {
        return;
    }
    // SAFETY: `data` is a leaked `glib::Sender<()>` living for the app lifetime.
    let tx = unsafe { &*(data as *const gtk::glib::Sender<()>) };
    let _ = tx.send(());
}

/// Insert a GLArea behind the transparent webview, create mpv's OpenGL render context, and wire the render
/// pump. Call AFTER `mpv_initialize` (with `vo=libmpv`), on the main thread (Tauri `setup`).
pub fn setup(window: &tauri::WebviewWindow, mpv: &Arc<mpv::Mpv>) -> Result<(), String> {
    // Resolve GL procs via libepoxy (already linked by GTK). Cache `epoxy_get_proc_address`, then use it
    // for glGetIntegerv (the FBO read). The library handle is leaked for the app lifetime.
    {
        use libloading::os::unix::{Library, Symbol};
        let lib = Library::new("libepoxy.so.0")
            .or_else(|_| Library::new("libepoxy.so"))
            .map_err(|e| e.to_string())?;
        let get: Symbol<EpoxyGetProc> = unsafe { lib.get(b"epoxy_get_proc_address").map_err(|e| e.to_string())? };
        EPOXY_GET_PROC.store(*get as usize as *mut c_void, Ordering::Relaxed);
        std::mem::forget(lib);
        GL_GET_INTEGERV.store(resolve(b"glGetIntegerv\0".as_ptr() as *const c_char), Ordering::Relaxed);
    }

    let gtk_window = window.gtk_window().map_err(|e| e.to_string())?;

    // ⚠️ RISK 1 — compositing: Tauri's GTK window holds the WebKitGTK webview as its child. We move that
    // child into a GtkOverlay with a GLArea as the overlay's BASE (so the video is behind) and the webview
    // as the overlay child (transparent, so the HTML player composites over the video). The draft PR warned
    // that wrapper-widget reparenting can trigger an undecorated-resize panic; if so, the fallback is a
    // wl_subsurface below the webview (soia's model) instead of a GTK overlay. Validate on device.
    let child = gtk_window.child().ok_or("Tauri GTK window has no child to reparent")?;
    gtk_window.remove(&child);
    let overlay = gtk::Overlay::new();
    let gl_area = gtk::GLArea::new();
    gl_area.set_hexpand(true);
    gl_area.set_vexpand(true);
    // mpv gpu/gpu-next want a modern context; GLArea defaults to desktop GL 3.2+ where available. Leave the
    // GDK default (do not force ES) so we get the best context the compositor offers.
    gl_area.set_has_depth_buffer(false);
    gl_area.set_has_stencil_buffer(false);
    overlay.add(&gl_area); // base layer (video)
    overlay.add_overlay(&child); // the webview, on top
    overlay.set_overlay_pass_through(&child, false);
    gtk_window.add(&overlay);
    overlay.show_all();

    // A main-thread channel: mpv's update callback (any thread) sends; the receiver queues a GLArea redraw.
    let (tx, rx) = gtk::glib::MainContext::channel::<()>(gtk::glib::Priority::default());
    {
        let area = gl_area.clone();
        rx.attach(None, move |_| {
            area.queue_render();
            gtk::glib::ControlFlow::Continue
        });
    }
    // Leak the sender so its pointer stays valid for the update callback for the app lifetime.
    let tx_ptr = Box::into_raw(Box::new(tx)) as *mut c_void;

    // Create the mpv render context when the GLArea's GL context is realized (GL must be current). Capture
    // the mpv ctx handle + display handles for VAAPI.
    let mpv_ctx = mpv.ctx_raw();
    let wl_display = wayland_display_ptr(&gtk_window);
    let x11_display = x11_display_ptr(&gtk_window);
    gl_area.connect_realize(move |area| {
        area.make_current();
        if let Some(e) = area.error() {
            log::error!("GLArea realize error: {e}");
            return;
        }
        let mut init = ffi::MpvOpenglInitParams {
            get_proc_address,
            get_proc_address_ctx: ptr::null_mut(),
        };
        let mut params = vec![
            ffi::MpvRenderParam {
                type_: ffi::MPV_RENDER_PARAM_API_TYPE,
                data: ffi::MPV_RENDER_API_TYPE_OPENGL.as_ptr() as *mut c_void,
            },
            ffi::MpvRenderParam {
                type_: ffi::MPV_RENDER_PARAM_OPENGL_INIT_PARAMS,
                data: &mut init as *mut _ as *mut c_void,
            },
        ];
        // Display handle for VAAPI hw-decode only (NOT output). Prefer Wayland, else X11.
        let mut wl = wl_display;
        let mut x11 = x11_display;
        if !wl.is_null() {
            params.push(ffi::MpvRenderParam { type_: ffi::MPV_RENDER_PARAM_WL_DISPLAY, data: &mut wl as *mut _ as *mut c_void });
        } else if !x11.is_null() {
            params.push(ffi::MpvRenderParam { type_: ffi::MPV_RENDER_PARAM_X11_DISPLAY, data: &mut x11 as *mut _ as *mut c_void });
        }
        params.push(ffi::MpvRenderParam { type_: ffi::MPV_RENDER_PARAM_INVALID, data: ptr::null_mut() });

        let mut ctx: *mut c_void = ptr::null_mut();
        let rc = unsafe { ffi::mpv_render_context_create(&mut ctx, mpv_ctx, params.as_mut_ptr()) };
        if rc < 0 || ctx.is_null() {
            log::error!("mpv_render_context_create failed: {rc}");
            return;
        }
        RENDER_CTX.store(ctx, Ordering::Release);
        unsafe { ffi::mpv_render_context_set_update_callback(ctx, on_update, tx_ptr) };
        log::info!("Linux render context up (GLArea)");
    });

    gl_area.connect_render(move |area, _ctx| {
        render(area);
        gtk::glib::Propagation::Stop
    });

    Ok(())
}

/// Best-effort resize hook. GLArea reallocates its own framebuffer on size/scale changes and re-renders,
/// and our `render()` reads the live allocation each pass — so there's nothing mpv-side to do. Kept for
/// symmetry with `render_macos::on_resize` and in case a future path needs an explicit refit.
pub fn on_resize(_window: &tauri::WebviewWindow) {}

// ── Display-handle extraction (VAAPI only) ───────────────────────────────────
// Pull the raw `wl_display` / X11 `Display*` from the GTK window's GDK display, so mpv's VAAPI decoder can
// reach the GPU. Returns null when the other backend is in use. These use gdk backend downcasts guarded so
// a mismatched session just yields null (mpv then decodes without that VAAPI hint).
fn wayland_display_ptr(gtk_window: &gtk::ApplicationWindow) -> *mut c_void {
    let Some(display) = gtk_window.display().dynamic_cast_ref::<gdkwayland::WaylandDisplay>().cloned() else {
        return ptr::null_mut();
    };
    // SAFETY: FFI to gdk_wayland_display_get_wl_display on a confirmed Wayland display.
    unsafe { gdkwayland::ffi::gdk_wayland_display_get_wl_display(display.to_glib_none().0) as *mut c_void }
}

fn x11_display_ptr(gtk_window: &gtk::ApplicationWindow) -> *mut c_void {
    let Some(display) = gtk_window.display().dynamic_cast_ref::<gdkx11::X11Display>().cloned() else {
        return ptr::null_mut();
    };
    // SAFETY: FFI to gdk_x11_display_get_xdisplay on a confirmed X11 display.
    unsafe { gdkx11::ffi::gdk_x11_display_get_xdisplay(display.to_glib_none().0) as *mut c_void }
}
