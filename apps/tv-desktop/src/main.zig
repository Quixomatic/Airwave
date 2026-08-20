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
    // Phase 0.3 Part 1 — prove mpv DECODES + RENDERS video on Windows: spin mpv
    // up in its OWN window playing a source (the --wid embed into the SDK window
    // + the airspace overlay are the next step). Pass a file path/URL as the
    // launch arg to play real media; defaults to an offline synthetic source.
    std.debug.print("[airwave] libmpv client API: 0x{x}\n", .{mpv.mpv_client_api_version()});
    var args = try std.process.Args.Iterator.initAllocator(init.minimal.args, init.gpa);
    defer args.deinit();
    _ = args.next(); // exe path
    const source_slice = args.next() orelse "av://lavfi:testsrc=size=1280x720:rate=30";
    if (mpv.mpv_create()) |h| {
        _ = mpv.mpv_set_option_string(h, "vo", "gpu-next");
        _ = mpv.mpv_set_option_string(h, "gpu-api", "auto");
        _ = mpv.mpv_set_option_string(h, "force-window", "yes");
        _ = mpv.mpv_set_option_string(h, "keep-open", "yes");
        _ = mpv.mpv_set_option_string(h, "title", "Airwave mpv (Phase 0.3 test)");
        if (mpv.mpv_initialize(h) == 0) {
            const source = try init.gpa.dupeZ(u8, source_slice);
            const load_arg: [*c]const u8 = "loadfile";
            const src_arg: [*c]const u8 = source.ptr;
            var cmd = [_][*c]const u8{ load_arg, src_arg, null };
            const rc = mpv.mpv_command(h, &cmd);
            std.debug.print("[airwave] mpv loadfile rc={d} source={s}\n", .{ rc, source_slice });
        } else {
            std.debug.print("[airwave] mpv_initialize failed\n", .{});
        }
        // Keep the handle alive for the run (leak for this test).
    }

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
