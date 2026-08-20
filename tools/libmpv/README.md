# Airwave libmpv build

Airwave's own reproducible **libmpv** build for the `apps/tv-tauri` desktop client.
Builds **vanilla libmpv** (ffmpeg + mpv from source) — Win/Mac/Linux — and packages a
self-contained runtime bundle (the `libmpv` DLL/dylib/.so, its link/import libs, and all
non-system runtime dependencies).

**Adapted from [FengZeng/mpv](https://github.com/FengZeng/mpv)** (GPL — see `LICENSE`), the
build recipe behind the Soia player. Differences from upstream:

- **No `soia_utils`** and **no soia mpv patch** (`ra_ctx_vulkan_soia` + symbol exports were
  for their proprietary render helper). We build plain libmpv — see `download.sh`.
- Package script drops `soia_utils` / `config.data` bundling.
- Renamed artifacts to `libmpv-airwave-*`.

## How it runs

The real build runs in **GitHub Actions** (`.github/workflows/libmpv-windows.yml`,
`workflow_dispatch`) on a `windows-2022` runner under MSYS2/MINGW64. It downloads mpv
`0.41.0`, builds ffmpeg + libmpv, packages the runtime, and uploads
`libmpv-airwave-*-windows-*.tar.gz`. macOS/Linux workflows are a fast-follow (the
`build-macos.sh` / `build-linux.sh` + vcpkg pieces are already vendored here).

## Consuming the artifact

Download the workflow artifact, extract, and vendor `bin/` (DLL + deps) + `lib/` (import
libs) + mpv headers into `apps/tv-tauri/src-tauri/vendor/libmpv/`. The Rust `build.rs`
handles MSVC linking (the mingw build emits a GNU `.dll.a`; generate/normalize an MSVC
import lib, or load dynamically) and ships the runtime DLLs beside the app binary.

## Local build (advanced)

Per upstream, this can also run locally under an MSYS2 MINGW64 shell:

```bash
bash ./download.sh        # vanilla mpv source
bash ./build-ffmpeg.sh    # ffmpeg from source
bash ./build-mingw64.sh   # libmpv
bash ./package-mingw64-runtime.sh --pkg-name libmpv-airwave-local-windows-x64
```

Override the mpv version with `MPV_VERSION=0.41.0`.
