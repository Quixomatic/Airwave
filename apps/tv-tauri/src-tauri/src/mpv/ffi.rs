//! Raw libmpv C client API bindings (`mpv/client.h`). Linked at build time — see `build.rs`.
//!
//! This is the FULL surface a complete player needs (matching what tv-native's `@airwave/mpv-player`
//! drives): lifecycle, options, properties in every format, observe/unobserve, the command variants,
//! events (incl. their payload structs), the node data model, wakeup, and timing. Not all of it is
//! wired into `mod.rs`/commands yet (Phase 4 grows those); the bindings are declared here so the safe
//! layer can reach for any of them without another FFI pass. `allow(dead_code)` because the
//! forward-looking bindings aren't all called yet.
#![allow(dead_code)]

use std::os::raw::{c_char, c_int, c_void};

/// `mpv_format` (mpv/client.h).
#[repr(i32)]
#[derive(Clone, Copy, Debug)]
pub enum MpvFormat {
    None = 0,
    String = 1,
    OsdString = 2,
    Flag = 3,
    Int64 = 4,
    Double = 5,
    Node = 6,
    NodeArray = 7,
    NodeMap = 8,
    ByteArray = 9,
}

/// `mpv_event_id` (mpv/client.h).
pub const MPV_EVENT_NONE: c_int = 0;
pub const MPV_EVENT_SHUTDOWN: c_int = 1;
pub const MPV_EVENT_LOG_MESSAGE: c_int = 2;
pub const MPV_EVENT_GET_PROPERTY_REPLY: c_int = 3;
pub const MPV_EVENT_SET_PROPERTY_REPLY: c_int = 4;
pub const MPV_EVENT_COMMAND_REPLY: c_int = 5;
pub const MPV_EVENT_START_FILE: c_int = 6;
pub const MPV_EVENT_END_FILE: c_int = 7;
pub const MPV_EVENT_FILE_LOADED: c_int = 8;
pub const MPV_EVENT_IDLE: c_int = 11;
pub const MPV_EVENT_TICK: c_int = 14;
pub const MPV_EVENT_CLIENT_MESSAGE: c_int = 16;
pub const MPV_EVENT_VIDEO_RECONFIG: c_int = 17;
pub const MPV_EVENT_AUDIO_RECONFIG: c_int = 18;
pub const MPV_EVENT_SEEK: c_int = 20;
pub const MPV_EVENT_PLAYBACK_RESTART: c_int = 21;
pub const MPV_EVENT_PROPERTY_CHANGE: c_int = 22;
pub const MPV_EVENT_QUEUE_OVERFLOW: c_int = 24;
pub const MPV_EVENT_HOOK: c_int = 25;

/// `mpv_end_file_reason`.
pub const MPV_END_FILE_REASON_EOF: c_int = 0;
pub const MPV_END_FILE_REASON_STOP: c_int = 2;
pub const MPV_END_FILE_REASON_QUIT: c_int = 3;
pub const MPV_END_FILE_REASON_ERROR: c_int = 4;
pub const MPV_END_FILE_REASON_REDIRECT: c_int = 5;

/// `mpv_log_level`.
pub const MPV_LOG_LEVEL_NONE: c_int = 0;
pub const MPV_LOG_LEVEL_FATAL: c_int = 10;
pub const MPV_LOG_LEVEL_ERROR: c_int = 20;
pub const MPV_LOG_LEVEL_WARN: c_int = 30;
pub const MPV_LOG_LEVEL_INFO: c_int = 40;
pub const MPV_LOG_LEVEL_V: c_int = 50;
pub const MPV_LOG_LEVEL_DEBUG: c_int = 60;
pub const MPV_LOG_LEVEL_TRACE: c_int = 70;

/// `mpv_node` — the recursive data model used by node-format properties (e.g. `track-list`) and
/// `mpv_command_node`. `u` is a C union discriminated by `format`.
#[repr(C)]
pub union MpvNodeU {
    pub string: *mut c_char,
    pub flag: c_int,
    pub int64: i64,
    pub double_: f64,
    pub list: *mut MpvNodeList,
    pub ba: *mut MpvByteArray,
    _pad: usize,
}

#[repr(C)]
pub struct MpvNode {
    pub u: MpvNodeU,
    pub format: c_int,
}

#[repr(C)]
pub struct MpvNodeList {
    pub num: c_int,
    pub values: *mut MpvNode,
    /// Present only for MAP nodes (parallel to `values`); null for arrays.
    pub keys: *mut *mut c_char,
}

#[repr(C)]
pub struct MpvByteArray {
    pub data: *mut c_void,
    pub size: usize,
}

/// `mpv_event` — leading fields common to every event.
#[repr(C)]
pub struct MpvEvent {
    pub event_id: c_int,
    pub error: c_int,
    pub reply_userdata: u64,
    pub data: *mut c_void,
}

/// `mpv_event_property` — payload of `MPV_EVENT_PROPERTY_CHANGE` (`event.data`).
#[repr(C)]
pub struct MpvEventProperty {
    pub name: *const c_char,
    pub format: c_int,
    pub data: *mut c_void,
}

/// `mpv_event_log_message` — payload of `MPV_EVENT_LOG_MESSAGE`.
#[repr(C)]
pub struct MpvEventLogMessage {
    pub prefix: *const c_char,
    pub level: *const c_char,
    pub text: *const c_char,
    pub log_level: c_int,
}

/// `mpv_event_end_file` — payload of `MPV_EVENT_END_FILE`.
#[repr(C)]
pub struct MpvEventEndFile {
    pub reason: c_int,
    pub error: c_int,
    pub playlist_entry_id: i64,
    pub playlist_insert_id: i64,
    pub playlist_insert_num_entries: c_int,
}

/// `mpv_event_client_message` — payload of `MPV_EVENT_CLIENT_MESSAGE` (script/keybind messages).
#[repr(C)]
pub struct MpvEventClientMessage {
    pub num_args: c_int,
    pub args: *mut *const c_char,
}

pub type MpvWakeupCallback = extern "C" fn(d: *mut c_void);

// ── Render API (mpv/render.h) — macOS embeds video by rendering into a layer WE own (soia's path),
// since mpv 0.41 has no CAMetalLayer-embed window context on macOS. `mpv_render_param` is a
// {type, data} pair; arrays are terminated by a param with type == INVALID (0). ─────────────────
#[repr(C)]
pub struct MpvRenderParam {
    pub type_: c_int,
    pub data: *mut c_void,
}

pub const MPV_RENDER_PARAM_INVALID: c_int = 0;
pub const MPV_RENDER_PARAM_API_TYPE: c_int = 1;
pub const MPV_RENDER_PARAM_OPENGL_INIT_PARAMS: c_int = 2;
pub const MPV_RENDER_PARAM_OPENGL_FBO: c_int = 3;
pub const MPV_RENDER_PARAM_FLIP_Y: c_int = 4;
pub const MPV_RENDER_PARAM_ADVANCED_CONTROL: c_int = 10;

/// `MPV_RENDER_API_TYPE_OPENGL` string value for the API_TYPE param.
pub const MPV_RENDER_API_TYPE_OPENGL: &[u8] = b"opengl\0";

/// Bit returned by `mpv_render_context_update`: a new frame is ready to render.
pub const MPV_RENDER_UPDATE_FRAME: u64 = 1;

/// `mpv_opengl_init_params` — how mpv resolves GL functions. `get_proc_address(ctx, name)` returns the
/// address of the named GL symbol (we resolve via dlsym on the OpenGL framework).
#[repr(C)]
pub struct MpvOpenglInitParams {
    pub get_proc_address: extern "C" fn(ctx: *mut c_void, name: *const c_char) -> *mut c_void,
    pub get_proc_address_ctx: *mut c_void,
}

/// `mpv_opengl_fbo` — the target framebuffer for `mpv_render_context_render`. fbo 0 = the current
/// GL context's default drawable; w/h are the viewport in PIXELS.
#[repr(C)]
pub struct MpvOpenglFbo {
    pub fbo: c_int,
    pub w: c_int,
    pub h: c_int,
    pub internal_format: c_int,
}

/// Update callback — invoked (from any thread) when a new frame should be drawn. It must only WAKE
/// the render loop, never render inline.
pub type MpvRenderUpdateFn = extern "C" fn(cb_ctx: *mut c_void);

extern "C" {
    // ── Lifecycle ────────────────────────────────────────────────────────────
    pub fn mpv_create() -> *mut c_void;
    pub fn mpv_initialize(ctx: *mut c_void) -> c_int;
    pub fn mpv_terminate_destroy(ctx: *mut c_void);
    pub fn mpv_client_name(ctx: *mut c_void) -> *const c_char;
    pub fn mpv_client_id(ctx: *mut c_void) -> i64;
    pub fn mpv_load_config_file(ctx: *mut c_void, path: *const c_char) -> c_int;

    // ── Commands ─────────────────────────────────────────────────────────────
    pub fn mpv_command(ctx: *mut c_void, args: *const *const c_char) -> c_int;
    pub fn mpv_command_string(ctx: *mut c_void, args: *const c_char) -> c_int;
    pub fn mpv_command_node(ctx: *mut c_void, args: *mut MpvNode, result: *mut MpvNode) -> c_int;
    pub fn mpv_command_async(ctx: *mut c_void, reply_userdata: u64, args: *const *const c_char) -> c_int;
    pub fn mpv_abort_async_command(ctx: *mut c_void, reply_userdata: u64);

    // ── Options ──────────────────────────────────────────────────────────────
    pub fn mpv_set_option(ctx: *mut c_void, name: *const c_char, format: c_int, data: *mut c_void) -> c_int;
    pub fn mpv_set_option_string(ctx: *mut c_void, name: *const c_char, data: *const c_char) -> c_int;

    // ── Properties ───────────────────────────────────────────────────────────
    pub fn mpv_set_property(ctx: *mut c_void, name: *const c_char, format: c_int, data: *mut c_void) -> c_int;
    pub fn mpv_set_property_string(ctx: *mut c_void, name: *const c_char, data: *const c_char) -> c_int;
    pub fn mpv_set_property_async(ctx: *mut c_void, reply_userdata: u64, name: *const c_char, format: c_int, data: *mut c_void) -> c_int;
    pub fn mpv_del_property(ctx: *mut c_void, name: *const c_char) -> c_int;
    pub fn mpv_get_property(ctx: *mut c_void, name: *const c_char, format: c_int, data: *mut c_void) -> c_int;
    pub fn mpv_get_property_string(ctx: *mut c_void, name: *const c_char) -> *mut c_char;
    pub fn mpv_get_property_osd_string(ctx: *mut c_void, name: *const c_char) -> *mut c_char;
    pub fn mpv_get_property_async(ctx: *mut c_void, reply_userdata: u64, name: *const c_char, format: c_int) -> c_int;
    pub fn mpv_observe_property(ctx: *mut c_void, reply_userdata: u64, name: *const c_char, format: c_int) -> c_int;
    pub fn mpv_unobserve_property(ctx: *mut c_void, registered_reply_userdata: u64) -> c_int;

    // ── Events / wakeup ──────────────────────────────────────────────────────
    pub fn mpv_wait_event(ctx: *mut c_void, timeout: f64) -> *mut MpvEvent;
    pub fn mpv_wakeup(ctx: *mut c_void);
    pub fn mpv_set_wakeup_callback(ctx: *mut c_void, cb: MpvWakeupCallback, d: *mut c_void);
    pub fn mpv_request_event(ctx: *mut c_void, event_id: c_int, enable: c_int) -> c_int;
    pub fn mpv_request_log_messages(ctx: *mut c_void, min_level: *const c_char) -> c_int;
    pub fn mpv_event_name(event_id: c_int) -> *const c_char;
    pub fn mpv_error_string(error: c_int) -> *const c_char;

    // ── Memory / timing ──────────────────────────────────────────────────────
    pub fn mpv_free(data: *mut c_void);
    pub fn mpv_free_node_contents(node: *mut MpvNode);
    pub fn mpv_get_time_us(ctx: *mut c_void) -> i64;

    // ── Render API (mpv/render.h) ────────────────────────────────────────────
    pub fn mpv_render_context_create(
        res: *mut *mut c_void,
        ctx: *mut c_void,
        params: *mut MpvRenderParam,
    ) -> c_int;
    pub fn mpv_render_context_set_update_callback(
        ctx: *mut c_void,
        callback: MpvRenderUpdateFn,
        callback_ctx: *mut c_void,
    );
    pub fn mpv_render_context_update(ctx: *mut c_void) -> u64;
    pub fn mpv_render_context_render(ctx: *mut c_void, params: *mut MpvRenderParam) -> c_int;
    pub fn mpv_render_context_free(ctx: *mut c_void);
}
