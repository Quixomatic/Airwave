//! tv-desktop app core (Zig). Model / Msg / update + the App wiring.
//! The UI lives in src/app.native (same markup a TS core would use).
//! This is the base; the mpv media-surface extension attaches through the
//! App's start_fn(*Runtime) seam (Phase 0.2).

const std = @import("std");
const runner = @import("runner");
const native_sdk = @import("native_sdk");

// libmpv (vendored, linked via build.zig). Zig links the C API directly.
const mpv = @cImport({
    @cInclude("mpv/client.h");
});

// ---------------------------------------------------------------- 0.3b: mpv --wid embed
// The SDK exposes NO way to reach its window HWND (checked docs + extern seam +
// RuntimeContext — none return a handle), so we self-locate our OWN process's
// top-level window via Win32 and parent an mpv child HWND to it (the plezy
// recipe: CreateWindowExW WS_CHILD -> mpv_set_option "wid"). App-side only, no
// SDK patch. Airspace (glass UI over this child) is 0.3c — needs the DComp patch.
const win = std.os.windows;
const HWND = win.HWND;
const RECT = extern struct { left: i32, top: i32, right: i32, bottom: i32 };
// Win32 BOOL/LPARAM as raw ABI ints (std wraps BOOL as an enum → no `!= 0`).
const BOOL = c_int;
const LPARAM = isize;

const WS_CHILD: u32 = 0x40000000;
const WS_VISIBLE: u32 = 0x10000000;
const WS_CLIPSIBLINGS: u32 = 0x04000000;
const WS_EX_NOPARENTNOTIFY: u32 = 0x00000004;
const GW_OWNER: u32 = 4;

const WndEnumProc = *const fn (HWND, LPARAM) callconv(.winapi) BOOL;
extern "user32" fn EnumWindows(cb: WndEnumProc, lparam: LPARAM) callconv(.winapi) BOOL;
extern "user32" fn GetWindowThreadProcessId(hwnd: HWND, pid: ?*u32) callconv(.winapi) u32;
extern "user32" fn IsWindowVisible(hwnd: HWND) callconv(.winapi) BOOL;
extern "user32" fn GetWindow(hwnd: HWND, cmd: u32) callconv(.winapi) ?HWND;
extern "user32" fn GetClientRect(hwnd: HWND, rect: *RECT) callconv(.winapi) BOOL;
extern "user32" fn CreateWindowExW(ex: u32, class: [*:0]const u16, name: [*:0]const u16, style: u32, x: i32, y: i32, w: i32, h: i32, parent: ?HWND, menu: ?win.HMENU, inst: ?win.HINSTANCE, param: ?*anyopaque) callconv(.winapi) ?HWND;
extern "user32" fn SetWindowPos(hwnd: HWND, insert_after: ?HWND, x: i32, y: i32, cx: i32, cy: i32, flags: u32) callconv(.winapi) BOOL;
extern "user32" fn BringWindowToTop(hwnd: HWND) callconv(.winapi) BOOL;
extern "user32" fn EnumChildWindows(parent: HWND, cb: WndEnumProc, lparam: LPARAM) callconv(.winapi) BOOL;
extern "user32" fn GetClassNameW(hwnd: HWND, buf: [*]u16, max: i32) callconv(.winapi) i32;
extern "kernel32" fn GetModuleHandleW(name: ?[*:0]const u16) callconv(.winapi) ?win.HINSTANCE;
extern "kernel32" fn GetCurrentProcessId() callconv(.winapi) u32;
extern "kernel32" fn Sleep(ms: u32) callconv(.winapi) void;

const SWP_NOSIZE: u32 = 0x0001;
const SWP_NOMOVE: u32 = 0x0002;
const SWP_NOACTIVATE: u32 = 0x0010;
const SWP_SHOWWINDOW: u32 = 0x0040;

const L = std.unicode.utf8ToUtf16LeStringLiteral;

// Process-lifetime state for the embed worker (leaked deliberately).
var g_pid: u32 = 0;
var g_main_hwnd: ?HWND = null;
var g_source: [:0]const u8 = undefined;
var g_mpv: ?*mpv.mpv_handle = null;

/// EnumWindows callback: latch the first visible, owner-less top-level window
/// belonging to OUR process — that's the SDK's main window.
fn enumProc(hwnd: HWND, lparam: LPARAM) callconv(.winapi) BOOL {
    _ = lparam;
    var pid: u32 = 0;
    _ = GetWindowThreadProcessId(hwnd, &pid);
    if (pid == g_pid and IsWindowVisible(hwnd) != 0 and GetWindow(hwnd, GW_OWNER) == null) {
        g_main_hwnd = hwnd;
        return 0; // FALSE → stop enumeration
    }
    return 1; // TRUE → keep looking
}

/// EnumChildWindows callback: log each child HWND's class + visibility so we
/// can see the SDK's window topology (is its canvas a sibling child HWND?).
fn childProc(hwnd: HWND, lparam: LPARAM) callconv(.winapi) BOOL {
    _ = lparam;
    var wbuf: [128]u16 = undefined;
    const n = GetClassNameW(hwnd, &wbuf, 128);
    var u8buf: [256]u8 = undefined;
    const len = if (n > 0) (std.unicode.utf16LeToUtf8(&u8buf, wbuf[0..@intCast(n)]) catch 0) else 0;
    std.debug.print("[airwave]   child hwnd=0x{x} class={s} visible={d}\n", .{ @intFromPtr(hwnd), u8buf[0..len], IsWindowVisible(hwnd) });
    return 1;
}

/// Runs off-thread: wait for the SDK window to exist (runWithOptions creates it
/// after we've already blocked), then embed mpv into a child of it via --wid.
fn embedWorker() void {
    g_pid = GetCurrentProcessId();

    // The canvas-first startup window is created hidden and shown after its
    // first present, so poll until it appears (~10s budget).
    var parent: HWND = undefined;
    var tries: u32 = 0;
    while (tries < 200) : (tries += 1) {
        g_main_hwnd = null;
        _ = EnumWindows(&enumProc, 0);
        if (g_main_hwnd) |h| {
            parent = h;
            break;
        }
        Sleep(50);
    }
    if (g_main_hwnd == null) {
        std.debug.print("[airwave] embed: main window not found (timed out)\n", .{});
        return;
    }

    var rect: RECT = undefined;
    _ = GetClientRect(parent, &rect);
    const w = rect.right - rect.left;
    const h = rect.bottom - rect.top;
    std.debug.print("[airwave] embed: parent client {d}x{d}\n", .{ w, h });

    const child = CreateWindowExW(
        WS_EX_NOPARENTNOTIFY,
        L("STATIC"),
        L(""),
        WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
        0,
        0,
        w,
        h,
        parent,
        null,
        GetModuleHandleW(null),
        null,
    ) orelse {
        std.debug.print("[airwave] embed: child HWND create failed\n", .{});
        return;
    };

    const handle = mpv.mpv_create() orelse {
        std.debug.print("[airwave] embed: mpv_create failed\n", .{});
        return;
    };
    g_mpv = handle;

    var wid: i64 = @intCast(@intFromPtr(child));
    _ = mpv.mpv_set_option(handle, "wid", mpv.MPV_FORMAT_INT64, @ptrCast(&wid));
    _ = mpv.mpv_set_option_string(handle, "vo", "gpu-next");
    _ = mpv.mpv_set_option_string(handle, "gpu-api", "auto");
    _ = mpv.mpv_set_option_string(handle, "keep-open", "yes");
    // 4K/HDR hints (harmless on SDR content) — mpv drives D3D11/gpu-next itself.
    _ = mpv.mpv_set_option_string(handle, "target-colorspace-hint", "yes");
    _ = mpv.mpv_set_option_string(handle, "hdr-compute-peak", "auto");

    if (mpv.mpv_initialize(handle) != 0) {
        std.debug.print("[airwave] embed: mpv_initialize failed\n", .{});
        return;
    }

    const load_arg: [*c]const u8 = "loadfile";
    const src_arg: [*c]const u8 = g_source.ptr;
    var cmd = [_][*c]const u8{ load_arg, src_arg, null };
    const rc = mpv.mpv_command(handle, &cmd);
    std.debug.print("[airwave] embed: mpv wid=0x{x} loadfile rc={d} source={s}\n", .{ @intFromPtr(child), rc, g_source });

    // --- DIAGNOSTIC (0.3b): why is only a white panel visible? ---
    // (1) Window topology: enumerate the parent's children so we can see
    //     whether the SDK canvas is a sibling child HWND we must out-z-order.
    std.debug.print("[airwave] parent=0x{x} children:\n", .{@intFromPtr(parent)});
    _ = EnumChildWindows(parent, &childProc, 0);

    // (2) Did mpv actually decode + configure video? Pump events for ~3s,
    //     keep raising the child, then read the decoded dimensions.
    var i: u32 = 0;
    while (i < 60) : (i += 1) {
        while (true) {
            const ev = mpv.mpv_wait_event(handle, 0);
            if (ev.*.event_id == mpv.MPV_EVENT_NONE) break;
            std.debug.print("[airwave]   mpv event: {s}\n", .{mpv.mpv_event_name(ev.*.event_id)});
        }
        _ = SetWindowPos(child, null, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
        _ = BringWindowToTop(child);
        Sleep(50);
    }
    var dwidth: i64 = 0;
    var dheight: i64 = 0;
    _ = mpv.mpv_get_property(handle, "dwidth", mpv.MPV_FORMAT_INT64, @ptrCast(&dwidth));
    _ = mpv.mpv_get_property(handle, "dheight", mpv.MPV_FORMAT_INT64, @ptrCast(&dheight));
    std.debug.print("[airwave] mpv decoded video: {d}x{d} (0x0 = not decoding)\n", .{ dwidth, dheight });
}

pub const panic = std.debug.FullPanic(native_sdk.debug.capturePanic);

const canvas = native_sdk.canvas;
const geometry = native_sdk.geometry;

const canvas_label = "main-canvas";
const window_width: f32 = 1280;
const window_height: f32 = 720;

const app_permissions = [_][]const u8{ native_sdk.security.permission_command, native_sdk.security.permission_view };
const shell_views = [_]native_sdk.ShellView{
    .{ .label = canvas_label, .kind = .gpu_surface, .fill = true, .role = "App canvas", .accessibility_label = "Airwave", .gpu_pixel_format = .bgra8_unorm, .gpu_present_mode = .timer, .gpu_alpha_mode = .@"opaque", .gpu_color_space = .srgb, .gpu_vsync = true },
};
const shell_windows = [_]native_sdk.ShellWindow{.{
    .label = "main",
    .title = "Airwave",
    .width = window_width,
    .height = window_height,
    .views = &shell_views,
}};
const shell_scene: native_sdk.ShellConfig = .{ .windows = &shell_windows };

// ------------------------------------------------------------------ model

pub const Msg = union(enum) {
    increment,
    decrement,
    reset,
    toggle_ticking,
    stamp,
    tick: native_sdk.EffectTimer,

    pub const view_unbound = .{"tick"};
};

pub const Model = struct {
    count: i64 = 0,
    ticking: bool = false,
    tick_count: i64 = 0,
    stamped_ms: i64 = -1,

    pub fn total(model: *const Model) i64 {
        return model.count + model.tick_count;
    }
};

pub const Effects = native_sdk.Effects(Msg);

pub const tick_timer_key: u64 = 1;

pub fn update(model: *Model, msg: Msg, fx: *Effects) void {
    switch (msg) {
        .increment => model.count += 1,
        .decrement => model.count -= 1,
        .reset => {
            model.count = 0;
            model.tick_count = 0;
        },
        .toggle_ticking => {
            model.ticking = !model.ticking;
            if (model.ticking) {
                fx.startTimer(.{
                    .key = tick_timer_key,
                    .interval_ms = 1000,
                    .mode = .repeating,
                    .on_fire = Effects.timerMsg(.tick),
                });
            } else {
                fx.cancelTimer(tick_timer_key);
            }
        },
        .stamp => model.stamped_ms = fx.wallMs(),
        .tick => |timer| {
            if (timer.outcome != .fired) return;
            model.tick_count += 1;
        },
    }
}

// ------------------------------------------------------------------- view

pub const AppUi = canvas.Ui(Msg);
pub const app_markup = @embedFile("app.native");

// -------------------------------------------------------------------- app

const AirwaveApp = native_sdk.UiApp(Model, Msg);

pub fn initialModel() Model {
    return .{};
}

pub fn main(init: std.process.Init) !void {
    // Phase 0.3b — embed mpv INTO the SDK window via --wid (one window now, not
    // two). The window doesn't exist until runWithOptions creates it, and that
    // call blocks, so the embed runs on a worker thread that waits for the
    // window then parents an mpv child to it. Pass a file path/URL as the launch
    // arg to play real media; defaults to an offline synthetic source.
    std.debug.print("[airwave] libmpv client API: 0x{x}\n", .{mpv.mpv_client_api_version()});
    var args = try std.process.Args.Iterator.initAllocator(init.minimal.args, init.gpa);
    defer args.deinit();
    _ = args.next(); // exe path
    const source_slice = args.next() orelse "av://lavfi:testsrc=size=1280x720:rate=30";
    g_source = try std.heap.page_allocator.dupeZ(u8, source_slice); // process-lifetime
    const embed_thread = std.Thread.spawn(.{}, embedWorker, .{}) catch |err| blk: {
        std.debug.print("[airwave] embed: thread spawn failed: {s}\n", .{@errorName(err)});
        break :blk null;
    };
    if (embed_thread) |t| t.detach();

    const app_state = try AirwaveApp.create(std.heap.page_allocator, .{
        .name = "tv-desktop",
        .scene = shell_scene,
        .canvas_label = canvas_label,
        .update_fx = update,
        .markup = .{ .source = app_markup, .watch_path = "src/app.native", .io = init.io },
    });
    defer app_state.destroy();
    app_state.model = initialModel();

    try runner.runWithOptions(app_state.app(), .{
        .app_name = "tv-desktop",
        .window_title = "Airwave",
        .bundle_id = "com.airwave.tvdesktop",
        .icon_path = "assets/icon.png",
        .default_frame = geometry.RectF.init(0, 0, window_width, window_height),
        .js_window_api = false,
        .security = .{
            .permissions = &app_permissions,
            .navigation = .{ .allowed_origins = &.{ "zero://inline", "zero://app" } },
        },
    }, init);
}
