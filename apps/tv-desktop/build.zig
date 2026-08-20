//! Owned app build (native eject). `addAppArtifacts` wires the standard app
//! build (exe, run, test, flags) and returns the handles so we can extend it —
//! here, link libmpv (vendor/libmpv) and ship its DLL beside the exe.

const std = @import("std");
const native_sdk = @import("native_sdk");

pub fn build(b: *std.Build) void {
    const dep = b.dependency("native_sdk", .{});
    const artifacts = native_sdk.addAppArtifacts(b, dep, .{ .name = "tv-desktop", .manifest = "app.json" });

    // libmpv: headers (@cImport in src/main.zig) + the GNU import lib; the
    // runtime DLL ships next to the exe. Vendored at vendor/libmpv/.
    const exe = artifacts.exe;
    exe.root_module.addIncludePath(b.path("vendor/libmpv/include"));
    exe.root_module.addObjectFile(b.path("vendor/libmpv/lib/libmpv.dll.a"));
    exe.root_module.link_libc = true;

    // Ship libmpv-2.dll into zig-out/bin next to the exe so mpv_create() resolves.
    b.getInstallStep().dependOn(&b.addInstallBinFile(b.path("vendor/libmpv/bin/libmpv-2.dll"), "libmpv-2.dll").step);
}
