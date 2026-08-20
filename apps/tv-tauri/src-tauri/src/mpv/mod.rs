//! libmpv integration for the Airwave desktop client.
//!
//! Thin, safe-ish wrapper over the libmpv C client API (FFI in `ffi.rs`),
//! linked at build time (see `build.rs`). The player renders into a native
//! child surface embedded in the Tauri window per-platform — see
//! `crate::platform` for the `--wid` attach on Windows.
//!
//! Adapted in spirit from `.refs/soia` (which drives the same C API), minus its
//! proprietary `soia_utils` render helper: we attach mpv to the window directly.

mod ffi;

use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_void};
use std::ptr;
use std::sync::atomic::{AtomicPtr, Ordering};

pub use ffi::MpvFormat;
pub use ffi::{MPV_EVENT_END_FILE, MPV_EVENT_FILE_LOADED};

/// Owns a libmpv context. `Send`/`Sync`: libmpv's client API is thread-safe for
/// the calls we make, and the context is guarded by an atomic pointer.
pub struct Mpv {
    ctx: AtomicPtr<c_void>,
}

unsafe impl Send for Mpv {}
unsafe impl Sync for Mpv {}

impl Mpv {
    /// Create + initialize an mpv context with Airwave's baseline options.
    /// Call [`Mpv::set_option_string`] for pre-init options BEFORE this if
    /// needed; here we set them then `mpv_initialize`.
    pub fn new() -> Result<Self, String> {
        let ctx = unsafe { ffi::mpv_create() };
        if ctx.is_null() {
            return Err("mpv_create() returned null (libmpv missing or LC_NUMERIC not C)".into());
        }
        let mpv = Mpv {
            ctx: AtomicPtr::new(ctx),
        };
        // Baseline: mpv drives its own GPU output (gpu-next → libplacebo/Vulkan),
        // keep the last frame on EOF, HDR hints (harmless on SDR content).
        for (k, v) in [
            ("vo", "gpu-next"),
            ("gpu-api", "auto"),
            ("keep-open", "yes"),
            ("target-colorspace-hint", "yes"),
            ("hdr-compute-peak", "auto"),
            ("audio-fallback-to-null", "yes"),
        ] {
            mpv.set_option_string(k, v)?;
        }
        Ok(mpv)
    }

    fn ctx(&self) -> *mut c_void {
        self.ctx.load(Ordering::Acquire)
    }

    /// Set a string option (pre- or post-init).
    pub fn set_option_string(&self, name: &str, value: &str) -> Result<(), String> {
        let c_name = CString::new(name).map_err(|_| "option name has null byte")?;
        let c_value = CString::new(value).map_err(|_| "option value has null byte")?;
        let rc =
            unsafe { ffi::mpv_set_option_string(self.ctx(), c_name.as_ptr(), c_value.as_ptr()) };
        if rc < 0 {
            Err(format!("mpv_set_option_string({name}={value}) failed: {rc}"))
        } else {
            Ok(())
        }
    }

    /// Set an INT64 option (used for `wid` — the native window handle).
    pub fn set_option_i64(&self, name: &str, mut value: i64) -> Result<(), String> {
        let c_name = CString::new(name).map_err(|_| "option name has null byte")?;
        let rc = unsafe {
            ffi::mpv_set_option(
                self.ctx(),
                c_name.as_ptr(),
                MpvFormat::Int64 as i32,
                &mut value as *mut i64 as *mut c_void,
            )
        };
        if rc < 0 {
            Err(format!("mpv_set_option({name}=i64) failed: {rc}"))
        } else {
            Ok(())
        }
    }

    /// Finish initialization (call after pre-init options like `wid`).
    pub fn initialize(&self) -> Result<(), String> {
        let rc = unsafe { ffi::mpv_initialize(self.ctx()) };
        if rc < 0 {
            Err(format!("mpv_initialize() failed: {rc}"))
        } else {
            Ok(())
        }
    }

    /// Run an mpv command (e.g. `["loadfile", url]`).
    pub fn command(&self, args: &[&str]) -> Result<(), String> {
        let c_args: Vec<CString> = args
            .iter()
            .map(|a| CString::new(*a).expect("command arg has null byte"))
            .collect();
        let mut raw: Vec<*const c_char> = c_args.iter().map(|c| c.as_ptr()).collect();
        raw.push(ptr::null());
        let rc = unsafe { ffi::mpv_command(self.ctx(), raw.as_ptr()) };
        if rc < 0 {
            Err(format!("mpv_command({args:?}) failed: {rc}"))
        } else {
            Ok(())
        }
    }

    /// Convenience: load + play a file/URL.
    pub fn loadfile(&self, url: &str) -> Result<(), String> {
        self.command(&["loadfile", url])
    }

    /// Read an INT64 property (e.g. `dwidth`/`dheight`/`aid`). None if unset/not yet available.
    pub fn get_property_i64(&self, name: &str) -> Option<i64> {
        let c_name = CString::new(name).ok()?;
        let mut out: i64 = 0;
        let rc = unsafe {
            ffi::mpv_get_property(
                self.ctx(),
                c_name.as_ptr(),
                MpvFormat::Int64 as i32,
                &mut out as *mut i64 as *mut c_void,
            )
        };
        if rc < 0 {
            None
        } else {
            Some(out)
        }
    }

    /// Block up to `timeout` seconds for the next event; returns `(event_id, error)`. The event
    /// pointer is mpv-owned and only valid until the next call, so we copy the fields out immediately.
    pub fn wait_event(&self, timeout: f64) -> (i32, i32) {
        unsafe {
            let ev = ffi::mpv_wait_event(self.ctx(), timeout);
            if ev.is_null() {
                return (ffi::MPV_EVENT_NONE, 0);
            }
            ((*ev).event_id, (*ev).error)
        }
    }

    /// Read a string property (caller-owned copy). Returns None if unset.
    pub fn get_property_string(&self, name: &str) -> Option<String> {
        let c_name = CString::new(name).ok()?;
        unsafe {
            let ptr = ffi::mpv_get_property_string(self.ctx(), c_name.as_ptr());
            if ptr.is_null() {
                return None;
            }
            let s = CStr::from_ptr(ptr).to_string_lossy().into_owned();
            ffi::mpv_free(ptr as *mut c_void);
            Some(s)
        }
    }
}

impl Drop for Mpv {
    fn drop(&mut self) {
        let ctx = self.ctx.swap(ptr::null_mut(), Ordering::AcqRel);
        if !ctx.is_null() {
            unsafe { ffi::mpv_terminate_destroy(ctx) };
        }
    }
}
