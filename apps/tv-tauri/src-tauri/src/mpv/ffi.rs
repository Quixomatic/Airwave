//! Raw libmpv C client API bindings (the subset Airwave uses).
//! Linked at build time — see `build.rs`. Header: `mpv/client.h`.

use std::os::raw::{c_char, c_int, c_void};

/// `mpv_format` (mpv/client.h). Only the variants we pass are enumerated.
#[repr(i32)]
#[derive(Clone, Copy, Debug)]
pub enum MpvFormat {
    None = 0,
    String = 1,
    Flag = 3,
    Int64 = 4,
    Double = 5,
}

extern "C" {
    pub fn mpv_create() -> *mut c_void;
    pub fn mpv_initialize(ctx: *mut c_void) -> c_int;
    pub fn mpv_terminate_destroy(ctx: *mut c_void);
    pub fn mpv_command(ctx: *mut c_void, args: *const *const c_char) -> c_int;
    pub fn mpv_set_option(
        ctx: *mut c_void,
        name: *const c_char,
        format: c_int,
        data: *mut c_void,
    ) -> c_int;
    pub fn mpv_set_option_string(
        ctx: *mut c_void,
        name: *const c_char,
        data: *const c_char,
    ) -> c_int;
    pub fn mpv_get_property_string(ctx: *mut c_void, name: *const c_char) -> *mut c_char;
    pub fn mpv_free(data: *mut c_void);
}
