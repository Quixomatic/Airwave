//! macOS video embedding via mpv's **render API** (soia's approach).
//!
//! mpv 0.41 has no CAMetalLayer/NSView-embed *window context* on macOS (see memory
//! `project-tv-tauri-macos-render`) — the cocoa/`macvk` contexts always make their own window. So
//! instead of handing mpv a `wid`, we run `vo=libmpv`, create an `mpv_render_context` (OpenGL), and
//! drive the drawing ourselves into an `NSOpenGLContext` attached to a view we insert BEHIND the
//! transparent WKWebView. A `CVDisplayLink` renders each vsync. All of this is macOS-only; Windows
//! keeps its child-HWND `wid` path untouched. The mini-feed (`video-margin-ratio`) works unchanged —
//! it's an mpv property that shrinks the rendered frame, exactly like on Windows.

use std::os::raw::{c_char, c_int, c_void};
use std::ptr;
use std::sync::atomic::{AtomicI32, AtomicPtr, Ordering};
use std::sync::{Arc, OnceLock};

use objc2::runtime::AnyObject;
use objc2::{class, msg_send};

use crate::mpv::{self, ffi};

// ── CoreVideo (CVDisplayLink) ────────────────────────────────────────────────
type CVDisplayLinkRef = *mut c_void;
type CVReturn = i32;
type CVDisplayLinkOutputCallback = extern "C" fn(
    display_link: CVDisplayLinkRef,
    in_now: *const c_void,
    in_output_time: *const c_void,
    flags_in: u64,
    flags_out: *mut u64,
    user_info: *mut c_void,
) -> CVReturn;

extern "C" {
    fn CVDisplayLinkCreateWithActiveCGDisplays(out: *mut CVDisplayLinkRef) -> CVReturn;
    fn CVDisplayLinkSetOutputCallback(
        dl: CVDisplayLinkRef,
        cb: CVDisplayLinkOutputCallback,
        user: *mut c_void,
    ) -> CVReturn;
    fn CVDisplayLinkStart(dl: CVDisplayLinkRef) -> CVReturn;
}

// ── CGL (lock the GL context across threads) ─────────────────────────────────
type CGLContextObj = *mut c_void;
extern "C" {
    fn CGLLockContext(ctx: CGLContextObj) -> c_int;
    fn CGLUnlockContext(ctx: CGLContextObj) -> c_int;
}

// ── dlopen/dlsym for mpv's GL proc resolution ────────────────────────────────
extern "C" {
    fn dlopen(path: *const c_char, mode: c_int) -> *mut c_void;
    fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
}
const RTLD_NOW: c_int = 2;

/// dlopen handle for the OpenGL framework (leaked for the app lifetime).
static GL_FRAMEWORK: OnceLock<usize> = OnceLock::new();

fn gl_framework() -> *mut c_void {
    *GL_FRAMEWORK.get_or_init(|| {
        let path = b"/System/Library/Frameworks/OpenGL.framework/OpenGL\0";
        let h = unsafe { dlopen(path.as_ptr() as *const c_char, RTLD_NOW) };
        h as usize
    }) as *mut c_void
}

/// mpv calls this to resolve each GL symbol it needs.
extern "C" fn get_proc_address(_ctx: *mut c_void, name: *const c_char) -> *mut c_void {
    unsafe { dlsym(gl_framework(), name) }
}

// Viewport size in PIXELS, shared between the main-thread resize hook and the display-link render.
static RENDER_W: AtomicI32 = AtomicI32::new(0);
static RENDER_H: AtomicI32 = AtomicI32::new(0);

/// Shared render state, handed to the display-link callback via a leaked raw pointer.
struct RenderState {
    mpv_render_ctx: *mut c_void,
    gl_context: *mut AnyObject,
    cgl: CGLContextObj,
}
unsafe impl Send for RenderState {}
unsafe impl Sync for RenderState {}

/// The live state pointer, so the window-resize hook can call `-update` on the GL context.
static STATE: AtomicPtr<RenderState> = AtomicPtr::new(ptr::null_mut());

/// Render one frame into the GL context's drawable (fbo 0). Runs on the CVDisplayLink thread; the CGL
/// lock makes the cross-thread GL use safe (setup happens on the main thread before the link starts).
fn render(state: &RenderState) {
    let w = RENDER_W.load(Ordering::Relaxed);
    let h = RENDER_H.load(Ordering::Relaxed);
    if w <= 0 || h <= 0 {
        return;
    }
    unsafe {
        CGLLockContext(state.cgl);
        let _: () = msg_send![state.gl_context, makeCurrentContext];
        let mut fbo = ffi::MpvOpenglFbo { fbo: 0, w, h, internal_format: 0 };
        let mut flip: c_int = 1;
        let mut params = [
            ffi::MpvRenderParam {
                type_: ffi::MPV_RENDER_PARAM_OPENGL_FBO,
                data: &mut fbo as *mut _ as *mut c_void,
            },
            ffi::MpvRenderParam {
                type_: ffi::MPV_RENDER_PARAM_FLIP_Y,
                data: &mut flip as *mut _ as *mut c_void,
            },
            ffi::MpvRenderParam { type_: ffi::MPV_RENDER_PARAM_INVALID, data: ptr::null_mut() },
        ];
        ffi::mpv_render_context_render(state.mpv_render_ctx, params.as_mut_ptr());
        let _: () = msg_send![state.gl_context, flushBuffer];
        CGLUnlockContext(state.cgl);
    }
}

extern "C" fn display_link_cb(
    _dl: CVDisplayLinkRef,
    _now: *const c_void,
    _out: *const c_void,
    _fi: u64,
    _fo: *mut u64,
    user: *mut c_void,
) -> CVReturn {
    if !user.is_null() {
        // SAFETY: `user` is the leaked RenderState pointer, valid for the app lifetime.
        let state = unsafe { &*(user as *const RenderState) };
        render(state);
    }
    0
}

// NSOpenGLPixelFormatAttribute values (AppKit).
const NSOPENGL_PFA_DOUBLE_BUFFER: u32 = 5;
const NSOPENGL_PFA_ACCELERATED: u32 = 73;
const NSOPENGL_PFA_OPENGL_PROFILE: u32 = 99;
const NSOPENGL_PROFILE_VERSION_4_1_CORE: u32 = 0x4100;

/// Insert a layer-backed GL host view behind the webview, attach an NSOpenGLContext, create mpv's
/// OpenGL render context, and start a CVDisplayLink. Call AFTER `mpv_initialize` (with `vo=libmpv`),
/// on the main thread (Tauri `setup`).
pub fn setup(window: &tauri::WebviewWindow, mpv: &Arc<mpv::Mpv>) -> Result<(), String> {
    let ns_window = window.ns_window().map_err(|e| e.to_string())? as *mut AnyObject;
    if ns_window.is_null() {
        return Err("null NSWindow".into());
    }
    unsafe {
        let content_view: *mut AnyObject = msg_send![ns_window, contentView];
        if content_view.is_null() {
            return Err("no contentView".into());
        }
        let bounds: objc2_foundation::NSRect = msg_send![content_view, bounds];
        let scale: f64 = msg_send![ns_window, backingScaleFactor];

        // Backmost, layer-backed host view for the GL drawable (behind the transparent webview).
        let view: *mut AnyObject = msg_send![class!(NSView), alloc];
        let view: *mut AnyObject = msg_send![view, initWithFrame: bounds];
        let _: () = msg_send![view, setWantsLayer: true];
        let _: () = msg_send![view, setAutoresizingMask: 18u64]; // width|height sizable
        let _: *mut AnyObject = msg_send![view, retain];
        let below: isize = -1; // NSWindowBelow
        let nil: *mut AnyObject = ptr::null_mut();
        let _: () = msg_send![content_view, addSubview: view, positioned: below, relativeTo: nil];

        // Pixel format: accelerated, double-buffered, GL 4.1 core (mpv gpu-next needs a modern core ctx).
        let attrs: [u32; 5] = [
            NSOPENGL_PFA_ACCELERATED,
            NSOPENGL_PFA_DOUBLE_BUFFER,
            NSOPENGL_PFA_OPENGL_PROFILE,
            NSOPENGL_PROFILE_VERSION_4_1_CORE,
            0,
        ];
        let pf: *mut AnyObject = msg_send![class!(NSOpenGLPixelFormat), alloc];
        let pf: *mut AnyObject = msg_send![pf, initWithAttributes: attrs.as_ptr()];
        if pf.is_null() {
            return Err("NSOpenGLPixelFormat init failed".into());
        }
        let glc: *mut AnyObject = msg_send![class!(NSOpenGLContext), alloc];
        let glc: *mut AnyObject = msg_send![glc, initWithFormat: pf, shareContext: nil];
        if glc.is_null() {
            return Err("NSOpenGLContext init failed".into());
        }
        let _: *mut AnyObject = msg_send![glc, retain];
        let _: () = msg_send![glc, setView: view];

        let cgl: CGLContextObj = msg_send![glc, CGLContextObj];

        // Initial viewport size (points → pixels).
        RENDER_W.store((bounds.size.width * scale) as i32, Ordering::Relaxed);
        RENDER_H.store((bounds.size.height * scale) as i32, Ordering::Relaxed);

        // Create the mpv OpenGL render context (GL must be current).
        let _: () = msg_send![glc, makeCurrentContext];
        let mut init = ffi::MpvOpenglInitParams {
            get_proc_address,
            get_proc_address_ctx: ptr::null_mut(),
        };
        let mut adv: c_int = 1;
        let mut create_params = [
            ffi::MpvRenderParam {
                type_: ffi::MPV_RENDER_PARAM_API_TYPE,
                // API_TYPE data is the C string itself (char*), not a pointer to it.
                data: ffi::MPV_RENDER_API_TYPE_OPENGL.as_ptr() as *mut c_void,
            },
            ffi::MpvRenderParam {
                type_: ffi::MPV_RENDER_PARAM_OPENGL_INIT_PARAMS,
                data: &mut init as *mut _ as *mut c_void,
            },
            ffi::MpvRenderParam {
                type_: ffi::MPV_RENDER_PARAM_ADVANCED_CONTROL,
                data: &mut adv as *mut _ as *mut c_void,
            },
            ffi::MpvRenderParam { type_: ffi::MPV_RENDER_PARAM_INVALID, data: ptr::null_mut() },
        ];
        let mut render_ctx: *mut c_void = ptr::null_mut();
        let rc = ffi::mpv_render_context_create(&mut render_ctx, mpv.ctx_raw(), create_params.as_mut_ptr());
        if rc < 0 || render_ctx.is_null() {
            return Err(format!("mpv_render_context_create failed: {rc}"));
        }

        let state = Box::into_raw(Box::new(RenderState {
            mpv_render_ctx: render_ctx,
            gl_context: glc,
            cgl,
        }));
        STATE.store(state, Ordering::Release);

        // Drive rendering at vsync.
        let mut dl: CVDisplayLinkRef = ptr::null_mut();
        if CVDisplayLinkCreateWithActiveCGDisplays(&mut dl) != 0 || dl.is_null() {
            return Err("CVDisplayLinkCreateWithActiveCGDisplays failed".into());
        }
        CVDisplayLinkSetOutputCallback(dl, display_link_cb, state as *mut c_void);
        CVDisplayLinkStart(dl);
        log::info!("macOS render context up (GL {}x{})", RENDER_W.load(Ordering::Relaxed), RENDER_H.load(Ordering::Relaxed));
        Ok(())
    }
}

/// Window resized — recompute the pixel viewport and tell the GL context to refit its drawable. Main
/// thread only (called from the Tauri window-event handler).
pub fn on_resize(window: &tauri::WebviewWindow) {
    let state = STATE.load(Ordering::Acquire);
    if state.is_null() {
        return;
    }
    let Ok(ns_window) = window.ns_window() else { return };
    let ns_window = ns_window as *mut AnyObject;
    if ns_window.is_null() {
        return;
    }
    unsafe {
        let content_view: *mut AnyObject = msg_send![ns_window, contentView];
        if content_view.is_null() {
            return;
        }
        let bounds: objc2_foundation::NSRect = msg_send![content_view, bounds];
        let scale: f64 = msg_send![ns_window, backingScaleFactor];
        RENDER_W.store((bounds.size.width * scale) as i32, Ordering::Relaxed);
        RENDER_H.store((bounds.size.height * scale) as i32, Ordering::Relaxed);
        let glc = (*state).gl_context;
        let _: () = msg_send![glc, update];
    }
}
