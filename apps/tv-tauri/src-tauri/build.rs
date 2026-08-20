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
