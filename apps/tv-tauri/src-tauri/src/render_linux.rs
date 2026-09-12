//! Linux video via mpv's **render API** into a Wayland **subsurface** placed BEHIND the transparent
//! WebKitGTK webview — soia's proven architecture, with NO GTK widget reparenting.
//!
//! Why not a GtkGLArea: inserting a GLArea means wrapping Tauri's webview in a container (GtkOverlay), which
//! reparents the webview — that panics Tauri's undecorated-resizing handler and blanks the UI. soia never
//! touches GTK widgets; it drops to raw Wayland: take the toplevel's `wl_surface` + `wl_display`, create a
//! `wl_subsurface` as a child placed *below* the parent, give it its own EGL window surface, and render mpv
//! into it. The webview (parent surface) stays untouched and composites over the video via its transparent
//! regions.
//!
//! Pipeline: raw-window-handle → (`wl_surface`, `wl_display`) → bind `wl_compositor`/`wl_subcompositor`
//! (wayland-client, own event queue) → child `wl_surface` + `wl_subsurface` (place_below + desync) →
//! `wl_egl_window` (wayland-egl) → `eglGetPlatformDisplay(EGL_PLATFORM_WAYLAND)` + config + context +
//! window surface → `mpv_render_context` (OpenGL, proc addr = `eglGetProcAddress`). Frames pump on mpv's
//! update-callback, bounced to the GTK main loop (glib channel), rendered into FBO 0 + `eglSwapBuffers`.
//!
//! ⚠️ UNVALIDATED end-to-end on hardware; iterate on Omarchy. Any failure here logs and leaves the (working)
//! UI intact — video is best-effort.

use std::os::raw::{c_char, c_int, c_void};
use std::ptr;
use std::sync::atomic::{AtomicI32, AtomicPtr, Ordering};
use std::sync::Arc;

use raw_window_handle::{HasDisplayHandle, HasWindowHandle, RawDisplayHandle, RawWindowHandle};
use wayland_client::backend::{Backend, ObjectId};
use wayland_client::globals::{registry_queue_init, GlobalListContents};
use wayland_client::protocol::{
    wl_compositor::WlCompositor, wl_registry::WlRegistry, wl_subcompositor::WlSubcompositor,
    wl_subsurface::WlSubsurface, wl_surface::WlSurface,
};
use wayland_client::{Connection, Dispatch, Proxy, QueueHandle};
use wayland_egl::WlEglSurface;

use crate::mpv::{self, ffi};

// ── EGL (host libEGL; never bundled — see the gtk-plugin exclude list) ────────
#[allow(non_camel_case_types)]
type EGLDisplay = *mut c_void;
#[allow(non_camel_case_types)]
type EGLConfig = *mut c_void;
#[allow(non_camel_case_types)]
type EGLContext = *mut c_void;
#[allow(non_camel_case_types)]
type EGLSurface = *mut c_void;

const EGL_PLATFORM_WAYLAND_KHR: u32 = 0x31D8;
const EGL_OPENGL_API: u32 = 0x30A2;
const EGL_NO_CONTEXT: EGLContext = ptr::null_mut();
const EGL_NONE: isize = 0x3038;
const EGL_SURFACE_TYPE: isize = 0x3033;
const EGL_WINDOW_BIT: isize = 0x0004;
const EGL_RENDERABLE_TYPE: isize = 0x3040;
const EGL_OPENGL_BIT: isize = 0x0008;
const EGL_RED_SIZE: isize = 0x3024;
const EGL_GREEN_SIZE: isize = 0x3023;
const EGL_BLUE_SIZE: isize = 0x3022;
const EGL_ALPHA_SIZE: isize = 0x3021;
const EGL_CONTEXT_MAJOR_VERSION: isize = 0x3098;

#[link(name = "EGL")]
extern "C" {
    fn eglGetPlatformDisplay(
        platform: u32,
        native_display: *mut c_void,
        attrib_list: *const isize,
    ) -> EGLDisplay;
    fn eglInitialize(dpy: EGLDisplay, major: *mut i32, minor: *mut i32) -> u32;
    fn eglBindAPI(api: u32) -> u32;
    fn eglChooseConfig(
        dpy: EGLDisplay,
        attribs: *const isize,
        configs: *mut EGLConfig,
        size: i32,
        num: *mut i32,
    ) -> u32;
    fn eglCreateContext(
        dpy: EGLDisplay,
        config: EGLConfig,
        share: EGLContext,
        attribs: *const isize,
    ) -> EGLContext;
    fn eglCreateWindowSurface(
        dpy: EGLDisplay,
        config: EGLConfig,
        win: *mut c_void,
        attribs: *const isize,
    ) -> EGLSurface;
    fn eglMakeCurrent(dpy: EGLDisplay, draw: EGLSurface, read: EGLSurface, ctx: EGLContext) -> u32;
    fn eglSwapBuffers(dpy: EGLDisplay, surface: EGLSurface) -> u32;
    fn eglSwapInterval(dpy: EGLDisplay, interval: i32) -> u32;
    fn eglGetError() -> i32;
    fn eglGetProcAddress(name: *const c_char) -> *mut c_void;
}

// mpv resolves each GL symbol it needs through the driver's eglGetProcAddress (matches plezy).
extern "C" fn get_proc_address(_ctx: *mut c_void, name: *const c_char) -> *mut c_void {
    unsafe { eglGetProcAddress(name) }
}

// Live render state, shared with the main-loop render handler. Raw pointers so the closure captures Copy.
static RENDER_CTX: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());
static EGL_DISPLAY: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());
static EGL_SURFACE: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());
static EGL_CONTEXT: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());
static FB_W: AtomicI32 = AtomicI32::new(0);
static FB_H: AtomicI32 = AtomicI32::new(0);
// The wl_egl_window, kept alive + resized on window resize. Boxed WlEglSurface leaked to a raw ptr.
static EGL_WINDOW: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());

// ── wayland-client dispatch (all events ignored; we only send requests) ───────
struct State;
impl Dispatch<WlRegistry, GlobalListContents> for State {
    fn event(
        _: &mut Self,
        _: &WlRegistry,
        _: wl_registry::Event,
        _: &GlobalListContents,
        _: &Connection,
        _: &QueueHandle<Self>,
    ) {
    }
}
use wayland_client::protocol::wl_registry;
macro_rules! ignore_events {
    ($($iface:ty),+ $(,)?) => {$(
        impl Dispatch<$iface, ()> for State {
            fn event(
                _: &mut Self,
                _: &$iface,
                _: <$iface as Proxy>::Event,
                _: &(),
                _: &Connection,
                _: &QueueHandle<Self>,
            ) {
            }
        }
    )+};
}
ignore_events!(WlCompositor, WlSubcompositor, WlSurface, WlSubsurface);

fn egl_err() -> i32 {
    unsafe { eglGetError() }
}

/// Render one mpv frame into the EGL window surface's default framebuffer. GTK main thread.
fn render() {
    let ctx = RENDER_CTX.load(Ordering::Acquire);
    let dpy = EGL_DISPLAY.load(Ordering::Acquire);
    let surf = EGL_SURFACE.load(Ordering::Acquire);
    let egl_ctx = EGL_CONTEXT.load(Ordering::Acquire);
    if ctx.is_null() || dpy.is_null() || surf.is_null() || egl_ctx.is_null() {
        return;
    }
    if unsafe { eglMakeCurrent(dpy, surf, surf, egl_ctx) } == 0 {
        log::error!("eglMakeCurrent (render) failed: 0x{:x}", egl_err());
        return;
    }
    let mut fbo = ffi::MpvOpenglFbo {
        fbo: 0, // the EGL window surface's default framebuffer
        w: FB_W.load(Ordering::Relaxed),
        h: FB_H.load(Ordering::Relaxed),
        internal_format: 0,
    };
    let mut flip: c_int = 1; // on-screen GL surface: flip Y (macOS render path uses the same)
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
    unsafe {
        if eglSwapBuffers(dpy, surf) == 0 {
            log::error!("eglSwapBuffers failed: 0x{:x}", egl_err());
        }
    }
}

/// mpv update-callback (any thread): wake the main loop to render. `data` is a leaked glib::Sender<()>.
extern "C" fn on_update(data: *mut c_void) {
    if data.is_null() {
        return;
    }
    let tx = unsafe { &*(data as *const gtk::glib::Sender<()>) };
    let _ = tx.send(());
}

/// Set up the subsurface + EGL + mpv render context. Best-effort: errors are logged, never fatal (the UI
/// keeps working without video). Call after `mpv_initialize` (with `vo=libmpv`), on the GTK main thread.
pub fn setup(window: &tauri::WebviewWindow, mpv: &Arc<mpv::Mpv>) -> Result<(), String> {
    // 1. Raw Wayland handles from the toplevel window.
    let display_ptr = match window.display_handle().map_err(|e| e.to_string())?.as_raw() {
        RawDisplayHandle::Wayland(d) => d.display.as_ptr(),
        other => return Err(format!("not a Wayland display: {other:?}")),
    };
    let parent_surface_ptr = match window.window_handle().map_err(|e| e.to_string())?.as_raw() {
        RawWindowHandle::Wayland(w) => w.surface.as_ptr(),
        other => return Err(format!("not a Wayland window: {other:?}")),
    };

    // 2. Wrap the foreign display; bind compositor + subcompositor via our own event queue (roundtrip).
    let backend = unsafe { Backend::from_foreign_display(display_ptr as *mut _) };
    let conn = Connection::from_backend(backend);
    let (globals, event_queue) =
        registry_queue_init::<State>(&conn).map_err(|e| format!("registry init: {e}"))?;
    let qh = event_queue.handle();
    let compositor: WlCompositor = globals
        .bind(&qh, 1..=6, ())
        .map_err(|e| format!("bind wl_compositor: {e}"))?;
    let subcompositor: WlSubcompositor = globals
        .bind(&qh, 1..=1, ())
        .map_err(|e| format!("bind wl_subcompositor: {e}"))?;

    // 3. Wrap the parent surface, create the child surface + subsurface (below the webview, desync).
    let parent = unsafe {
        WlSurface::from_id(
            &conn,
            ObjectId::from_ptr(WlSurface::interface(), parent_surface_ptr as *mut _)
                .map_err(|e| format!("parent surface id: {e}"))?,
        )
        .map_err(|e| format!("parent surface proxy: {e}"))?
    };
    let child: WlSurface = compositor.create_surface(&qh, ());
    let subsurface: WlSubsurface = subcompositor.get_subsurface(&child, &parent, &qh, ());
    subsurface.set_position(0, 0);
    subsurface.place_below(&parent); // video behind the transparent webview
    subsurface.set_desync(); // child commits (eglSwapBuffers) apply without waiting on the parent

    // 4. Size = the window's physical pixels.
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let (w, h) = (size.width.max(1) as i32, size.height.max(1) as i32);
    FB_W.store(w, Ordering::Relaxed);
    FB_H.store(h, Ordering::Relaxed);

    // 5. wl_egl_window on the child surface.
    let egl_window =
        WlEglSurface::new(child.id(), w, h).map_err(|e| format!("wl_egl_window: {e}"))?;
    let egl_window_ptr = egl_window.ptr() as *mut c_void;

    // 6. EGL: platform display, config, context, window surface.
    let dpy = unsafe { eglGetPlatformDisplay(EGL_PLATFORM_WAYLAND_KHR, display_ptr as *mut _, ptr::null()) };
    if dpy.is_null() {
        return Err(format!("eglGetPlatformDisplay failed: 0x{:x}", egl_err()));
    }
    if unsafe { eglInitialize(dpy, ptr::null_mut(), ptr::null_mut()) } == 0 {
        return Err(format!("eglInitialize failed: 0x{:x}", egl_err()));
    }
    if unsafe { eglBindAPI(EGL_OPENGL_API) } == 0 {
        return Err(format!("eglBindAPI failed: 0x{:x}", egl_err()));
    }
    let cfg_attribs: [isize; 13] = [
        EGL_SURFACE_TYPE, EGL_WINDOW_BIT,
        EGL_RENDERABLE_TYPE, EGL_OPENGL_BIT,
        EGL_RED_SIZE, 8,
        EGL_GREEN_SIZE, 8,
        EGL_BLUE_SIZE, 8,
        EGL_ALPHA_SIZE, 8,
        EGL_NONE,
    ];
    let mut config: EGLConfig = ptr::null_mut();
    let mut num_cfg: i32 = 0;
    if unsafe { eglChooseConfig(dpy, cfg_attribs.as_ptr(), &mut config, 1, &mut num_cfg) } == 0
        || num_cfg == 0
    {
        return Err(format!("eglChooseConfig failed: 0x{:x}", egl_err()));
    }
    let ctx_attribs: [isize; 3] = [EGL_CONTEXT_MAJOR_VERSION, 3, EGL_NONE];
    let egl_ctx = unsafe { eglCreateContext(dpy, config, EGL_NO_CONTEXT, ctx_attribs.as_ptr()) };
    if egl_ctx.is_null() {
        return Err(format!("eglCreateContext failed: 0x{:x}", egl_err()));
    }
    let egl_surf =
        unsafe { eglCreateWindowSurface(dpy, config, egl_window_ptr, ptr::null()) };
    if egl_surf.is_null() {
        return Err(format!("eglCreateWindowSurface failed: 0x{:x}", egl_err()));
    }
    if unsafe { eglMakeCurrent(dpy, egl_surf, egl_surf, egl_ctx) } == 0 {
        return Err(format!("eglMakeCurrent (setup) failed: 0x{:x}", egl_err()));
    }
    unsafe { eglSwapInterval(dpy, 0) }; // don't block the GTK main loop on vsync

    // 7. mpv render context (GL context is current now).
    let mut init = ffi::MpvOpenglInitParams {
        get_proc_address,
        get_proc_address_ctx: ptr::null_mut(),
    };
    let mut wl = display_ptr as *mut c_void;
    let mut params = [
        ffi::MpvRenderParam {
            type_: ffi::MPV_RENDER_PARAM_API_TYPE,
            data: ffi::MPV_RENDER_API_TYPE_OPENGL.as_ptr() as *mut c_void,
        },
        ffi::MpvRenderParam {
            type_: ffi::MPV_RENDER_PARAM_OPENGL_INIT_PARAMS,
            data: &mut init as *mut _ as *mut c_void,
        },
        // VAAPI hw-decode hint only (not output).
        ffi::MpvRenderParam {
            type_: ffi::MPV_RENDER_PARAM_WL_DISPLAY,
            data: &mut wl as *mut _ as *mut c_void,
        },
        ffi::MpvRenderParam {
            type_: ffi::MPV_RENDER_PARAM_INVALID,
            data: ptr::null_mut(),
        },
    ];
    let mut render_ctx: *mut c_void = ptr::null_mut();
    let rc =
        unsafe { ffi::mpv_render_context_create(&mut render_ctx, mpv.ctx_raw(), params.as_mut_ptr()) };
    if rc < 0 || render_ctx.is_null() {
        return Err(format!("mpv_render_context_create failed: {rc}"));
    }

    // Publish state for the render handler + resize hook.
    EGL_DISPLAY.store(dpy, Ordering::Release);
    EGL_CONTEXT.store(egl_ctx, Ordering::Release);
    EGL_SURFACE.store(egl_surf, Ordering::Release);
    EGL_WINDOW.store(Box::into_raw(Box::new(egl_window)) as *mut c_void, Ordering::Release);
    RENDER_CTX.store(render_ctx, Ordering::Release);

    // 8. Pump: mpv update-callback (any thread) → glib channel → render on the main loop.
    let (tx, rx) = gtk::glib::MainContext::channel::<()>(gtk::glib::Priority::default());
    rx.attach(None, move |_| {
        render();
        gtk::glib::ControlFlow::Continue
    });
    let tx_ptr = Box::into_raw(Box::new(tx)) as *mut c_void;
    unsafe { ffi::mpv_render_context_set_update_callback(render_ctx, on_update, tx_ptr) };

    // Flush the queued subsurface requests to the compositor (placement applies on the parent's next
    // commit, which GTK issues as it renders the webview; the child's first buffer arrives via
    // eglSwapBuffers on the first render).
    let _ = conn.flush();

    // Keep the wayland objects + connection alive for the app lifetime (subsurface must not be dropped).
    std::mem::forget(conn);
    std::mem::forget(event_queue);
    std::mem::forget(globals);
    std::mem::forget(compositor);
    std::mem::forget(subcompositor);
    std::mem::forget(parent);
    std::mem::forget(child);
    std::mem::forget(subsurface);

    log::info!("linux video: subsurface + EGL render context up ({w}x{h})");
    Ok(())
}

/// Resize the EGL window (and remembered FBO size) when the window resizes. GTK main thread.
pub fn on_resize(window: &tauri::WebviewWindow) {
    let Ok(size) = window.inner_size() else {
        return;
    };
    let (w, h) = (size.width.max(1) as i32, size.height.max(1) as i32);
    FB_W.store(w, Ordering::Relaxed);
    FB_H.store(h, Ordering::Relaxed);
    let win = EGL_WINDOW.load(Ordering::Acquire);
    if !win.is_null() {
        // SAFETY: win is our leaked WlEglSurface for the app lifetime; resize is main-thread only.
        let egl_window = unsafe { &*(win as *const WlEglSurface) };
        egl_window.resize(w, h, 0, 0);
    }
}
