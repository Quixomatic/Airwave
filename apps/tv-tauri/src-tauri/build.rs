use std::path::PathBuf;
use std::{env, fs};

fn main() {
    tauri_build::build();

    // ---- libmpv linking (our own build, vendored per os-arch) ----
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap();
    let target_arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap();

    let plat = match (target_os.as_str(), target_arch.as_str()) {
        ("windows", "x86_64") => "windows-x64",
        ("windows", "aarch64") => "windows-arm64",
        ("macos", "aarch64") => "macos-arm64",
        ("macos", "x86_64") => "macos-x64",
        ("linux", "x86_64") => "linux-x64",
        ("linux", "aarch64") => "linux-arm64",
        (os, arch) => panic!("unsupported target for libmpv: {os}/{arch}"),
    };

    let vendor = manifest.join("vendor/libmpv").join(plat);
    let lib_dir = vendor.join("lib");
    let bin_dir = vendor.join("bin");

    if !lib_dir.exists() {
        panic!(
            "libmpv not vendored for {plat} at {}.\n\
             Download it: gh release download libmpv-latest --repo Quixomatic/Airwave \\\n\
               --pattern 'libmpv-airwave-{plat}.tar.gz'  then extract into vendor/libmpv/{plat}/",
            lib_dir.display()
        );
    }

    println!("cargo:rustc-link-search=native={}", lib_dir.display());

    // Linux creates a dedicated X11 child below WebKitGTK for libmpv's `wid`.
    // The gtk/gdk link set does not expose the Xlib symbols used to create and
    // resize that child, so link the X11 client library explicitly.
    if target_os == "linux" {
        println!("cargo:rustc-link-lib=X11");
    }

    // macOS: the runtime ships as `libmpv.2.dylib` (soname) but the linker wants `libmpv.dylib` for
    // `-l mpv`. Create the dev symlink if missing. Add rpaths: the vendor lib dir (so `cargo run` finds
    // the dylibs in dev) + `@executable_path/../Frameworks` (the bundled `.app`, where the bundling step
    // copies + `@rpath`-rewrites the dylibs — see plan Phase 8A).
    if target_os == "macos" {
        let link = lib_dir.join("libmpv.dylib");
        if !link.exists() {
            if let Some(real) = fs::read_dir(&lib_dir).ok().and_then(|rd| {
                rd.flatten().map(|e| e.path()).find(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.starts_with("libmpv.") && n.ends_with(".dylib"))
                        .unwrap_or(false)
                })
            }) {
                #[cfg(unix)]
                let _ = std::os::unix::fs::symlink(real.file_name().unwrap(), &link);
                #[cfg(not(unix))]
                let _ = real;
            }
        }
        println!("cargo:rustc-link-arg=-Wl,-rpath,{}", lib_dir.display());
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks");
        // The macOS render path (render_macos.rs) uses CVDisplayLink (CoreVideo) + NSOpenGLContext/CGL
        // (OpenGL). AppKit/Foundation come from objc2/tauri; these two frameworks need explicit linking.
        println!("cargo:rustc-link-lib=framework=CoreVideo");
        println!("cargo:rustc-link-lib=framework=OpenGL");
        // Dev (`cargo run`, no .app bundle): compile in the vendored MoltenVK ICD path so the app can
        // set VK_ICD_FILENAMES to it (the packaged app finds the ICD in Contents/Resources instead).
        println!(
            "cargo:rustc-env=AIRWAVE_DEV_VK_ICD={}",
            lib_dir.join("MoltenVK_icd.json").display()
        );
    }

    // mpv.lib (Windows, references libmpv-2.dll) / libmpv.dylib / libmpv.so → "mpv".
    println!("cargo:rustc-link-lib=dylib=mpv");

    // Dev: stage the runtime DLLs (libmpv-2.dll + its ~50 deps) beside the built
    // exe so they resolve at launch. Release bundling is handled via tauri.conf
    // resources (a later step).
    if target_os == "windows" {
        let profile = env::var("PROFILE").unwrap(); // "debug" | "release"
        let out = manifest.join("target").join(&profile);
        let _ = fs::create_dir_all(&out);
        if let Ok(entries) = fs::read_dir(&bin_dir) {
            for e in entries.flatten() {
                let p = e.path();
                if p.extension().map(|x| x == "dll").unwrap_or(false) {
                    let _ = fs::copy(&p, out.join(p.file_name().unwrap()));
                }
            }
        }
    }

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=vendor/libmpv/{plat}/lib");
}
