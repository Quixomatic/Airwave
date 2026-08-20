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
extern "kernel32" fn GetModuleHandleW(name: ?[*:0]const u16) callconv(.winapi) ?win.HINSTANCE;

// Message pump for the worker thread — our video child HWND lives on this
// thread, so we MUST pump its messages or the main thread deadlocks during
// move/resize (its cross-window SendMessage to the child blocks until we pump).
const POINT = extern struct { x: i32, y: i32 };
const MSG = extern struct { hwnd: ?HWND, message: u32, wParam: usize, lParam: isize, time: u32, pt: POINT, lPrivate: u32 };
const PM_REMOVE: u32 = 0x0001;
const QS_ALLINPUT: u32 = 0x04FF;
extern "user32" fn PeekMessageW(msg: *MSG, hwnd: ?HWND, min: u32, max: u32, remove: u32) callconv(.winapi) BOOL;
extern "user32" fn TranslateMessage(msg: *const MSG) callconv(.winapi) BOOL;
extern "user32" fn DispatchMessageW(msg: *const MSG) callconv(.winapi) isize;
extern "user32" fn MsgWaitForMultipleObjectsEx(count: u32, handles: ?*const anyopaque, ms: u32, wake_mask: u32, flags: u32) callconv(.winapi) u32;

// 0.3c: patched host export — set up the DComp glass (per-pixel alpha, topmost)
// over the video child. Keyed on the top-level HWND we already hold. Proof stage
// draws a scrim gradient; later this composites the real SDK chrome canvas.
extern fn native_sdk_windows_video_glass_setup(hwnd: ?*anyopaque) callconv(.c) c_int;
extern "kernel32" fn GetCurrentProcessId() callconv(.winapi) u32;
extern "kernel32" fn Sleep(ms: u32) callconv(.winapi) void;

// The mpv child uses a dedicated window class so the patched SDK host can
// recognize it (FindWindowExW by class) and fold it into its layer z-order.
const video_class = L("AirwaveVideo");
const WNDCLASSEXW = extern struct {
    cbSize: u32,
    style: u32 = 0,
    lpfnWndProc: *const fn (HWND, u32, usize, isize) callconv(.winapi) isize,
    cbClsExtra: i32 = 0,
    cbWndExtra: i32 = 0,
    hInstance: ?win.HINSTANCE = null,
    hIcon: ?*anyopaque = null,
    hCursor: ?*anyopaque = null,
    hbrBackground: ?*anyopaque = null,
    lpszMenuName: ?[*:0]const u16 = null,
    lpszClassName: [*:0]const u16,
    hIconSm: ?*anyopaque = null,
};
extern "user32" fn RegisterClassExW(cls: *const WNDCLASSEXW) callconv(.winapi) u16;
extern "user32" fn DefWindowProcW(hwnd: HWND, msg: u32, wparam: usize, lparam: isize) callconv(.winapi) isize;

fn videoWndProc(hwnd: HWND, msg: u32, wparam: usize, lparam: isize) callconv(.winapi) isize {
    return DefWindowProcW(hwnd, msg, wparam, lparam);
}

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

    // Register the mpv child's window class (idempotent; a second call just
    // fails harmlessly). The host recognizes this class to z-order the video.
    var wc = WNDCLASSEXW{ .cbSize = @sizeOf(WNDCLASSEXW), .lpfnWndProc = &videoWndProc, .lpszClassName = video_class };
    wc.hInstance = GetModuleHandleW(null);
    _ = RegisterClassExW(&wc);

    const child = CreateWindowExW(
        WS_EX_NOPARENTNOTIFY,
        video_class,
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

    // Bring the video child to the top of the sibling z-order once; the patched
    // host keeps it there (folds "AirwaveVideo" into reorderWindowChildren) and
    // the window's WS_CLIPCHILDREN stops the parent repainting over it.
    _ = SetWindowPos(child, null, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);

    // 0.3c: set up a DirectComposition topmost visual (per-pixel alpha) over the
    // whole window and draw the player-chrome scrim. DComp composes it ABOVE the
    // child-HWND video, so the glass chrome shows over live video — the airspace
    // fix. (Increment 2 will draw the real SDK chrome canvas here, not a gradient.)
    Sleep(400);
    const glass_rc = native_sdk_windows_video_glass_setup(@ptrCast(parent));
    std.debug.print("[airwave] 0.3c: DComp glass rc={d} (1=ok, negative=failed step)\n", .{glass_rc});

    // Combined loop for the process lifetime: pump this thread's Windows
    // messages (REQUIRED — the video child HWND is owned by this thread; without
    // pumping, the main thread deadlocks on move/resize) and drain mpv events.
    // MsgWaitForMultipleObjectsEx parks the thread until a message arrives or a
    // short timeout, so this is ~no CPU when idle. Rendering runs on mpv threads.
    var msg: MSG = undefined;
    var last_w = w;
    var last_h = h;
    while (true) {
        while (PeekMessageW(&msg, null, 0, 0, PM_REMOVE) != 0) {
            _ = TranslateMessage(&msg);
            _ = DispatchMessageW(&msg);
        }
        var shutting_down = false;
        while (true) {
            const ev = mpv.mpv_wait_event(handle, 0);
            if (ev.*.event_id == mpv.MPV_EVENT_NONE) break;
            if (ev.*.event_id == mpv.MPV_EVENT_SHUTDOWN) shutting_down = true;
        }
        if (shutting_down) break;

        // Track window resize: when the parent's client rect changes, reflow the
        // video child to fill it and rebuild the DComp glass at the new size — so
        // it behaves like a normal, resizable window (plezy's SetRect role).
        var cur: RECT = undefined;
        _ = GetClientRect(parent, &cur);
        const cw = cur.right - cur.left;
        const ch = cur.bottom - cur.top;
        if (cw > 0 and ch > 0 and (cw != last_w or ch != last_h)) {
            last_w = cw;
            last_h = ch;
            _ = SetWindowPos(child, null, 0, 0, cw, ch, SWP_NOMOVE | SWP_NOACTIVATE);
            _ = native_sdk_windows_video_glass_setup(@ptrCast(parent));
        }

        _ = MsgWaitForMultipleObjectsEx(0, null, 16, QS_ALLINPUT, 0);
    }
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
