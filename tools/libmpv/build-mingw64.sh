#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="$PROJECT_ROOT/vendor"
MPV_DIR="$VENDOR_DIR/mpv"
BUILD_DIR="$MPV_DIR/buildout"
MINGW_PREFIX="${MINGW_PREFIX:-/mingw64}"
FFMPEG_BUILD_NAME="${FFMPEG_BUILD_NAME:-$(basename "$MINGW_PREFIX")}"
FFMPEG_PREFIX="${FFMPEG_PREFIX:-$PROJECT_ROOT/vendor/ffmpeg-build/$FFMPEG_BUILD_NAME}"

if [ ! -d "$MPV_DIR" ]; then
    echo "Missing mpv source: $MPV_DIR"
    echo "Run: ./download.sh"
    exit 1
fi

if [ ! -d "$MINGW_PREFIX" ]; then
    echo "Missing mingw prefix: $MINGW_PREFIX" >&2
    echo "Run this script under MSYS2 MINGW64 environment." >&2
    exit 1
fi

export PATH="$MINGW_PREFIX/bin:$PATH"
export PKG_CONFIG="$MINGW_PREFIX/bin/pkg-config"
if [ -d "$FFMPEG_PREFIX" ]; then
    export PATH="$FFMPEG_PREFIX/bin:$PATH"
    export PKG_CONFIG_PATH="$FFMPEG_PREFIX/lib/pkgconfig:$MINGW_PREFIX/lib/pkgconfig:$MINGW_PREFIX/share/pkgconfig:${PKG_CONFIG_PATH:-}"
    export PKG_CONFIG_LIBDIR="$FFMPEG_PREFIX/lib/pkgconfig:$MINGW_PREFIX/lib/pkgconfig:$MINGW_PREFIX/share/pkgconfig"
else
    export PKG_CONFIG_PATH="$MINGW_PREFIX/lib/pkgconfig:$MINGW_PREFIX/share/pkgconfig:${PKG_CONFIG_PATH:-}"
    export PKG_CONFIG_LIBDIR="$MINGW_PREFIX/lib/pkgconfig:$MINGW_PREFIX/share/pkgconfig"
fi

if ! command -v meson >/dev/null 2>&1; then
    echo "meson not found in PATH" >&2
    exit 1
fi
if ! command -v ninja >/dev/null 2>&1; then
    echo "ninja not found in PATH" >&2
    exit 1
fi

echo "Building with MINGW_PREFIX=$MINGW_PREFIX"
echo "Building with FFMPEG_PREFIX=$FFMPEG_PREFIX (exists: $([ -d "$FFMPEG_PREFIX" ] && echo yes || echo no))"
echo "Using PKG_CONFIG_PATH=$PKG_CONFIG_PATH"

cd "$MPV_DIR"

MESON_ARGS=(
    --buildtype=release
    -Dlibmpv=true
    -Dcplayer=false
    -Dvulkan=enabled
    -Dlua=enabled
    -Dlibarchive=disabled
)

if [ ! -d "$BUILD_DIR" ]; then
    echo "Configuring Meson..."
    meson setup buildout "${MESON_ARGS[@]}"
else
    echo "Reconfiguring Meson (wipe old options)..."
    meson setup buildout --reconfigure "${MESON_ARGS[@]}"
fi

echo "Building..."
meson compile -C buildout

DLL_COUNT="$(ls -1 "$BUILD_DIR"/libmpv*.dll 2>/dev/null | wc -l | tr -d ' ')"
if [ "$DLL_COUNT" = "0" ]; then
    echo "Build finished but no libmpv*.dll found in $BUILD_DIR" >&2
    exit 1
fi

echo "Build output ready in: $BUILD_DIR"
