#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="$PROJECT_ROOT/vendor"
FFMPEG_DIR="$VENDOR_DIR/ffmpeg"
FFMPEG_TARBALL="$VENDOR_DIR/ffmpeg-n8.1.tar.gz"
DAV1D_DIR="$VENDOR_DIR/dav1d"
DAV1D_TARBALL="$VENDOR_DIR/dav1d-1.5.3.tar.gz"
MINGW_PREFIX="${MINGW_PREFIX:-/mingw64}"
BUILD_OS="$(uname -s)"
BUILD_MACHINE="$(uname -m)"
BUILD_TARGET_MACHINE="${MPV_TARGET_ARCH:-$BUILD_MACHINE}"
case "$BUILD_TARGET_MACHINE" in
    arm64) DEFAULT_FFMPEG_ARCH="aarch64" ;;
    *) DEFAULT_FFMPEG_ARCH="$BUILD_TARGET_MACHINE" ;;
esac
FFMPEG_ARCH="${FFMPEG_ARCH:-$DEFAULT_FFMPEG_ARCH}"
if [[ "$BUILD_OS" == MINGW* || "$BUILD_OS" == MSYS* || "$BUILD_OS" == CYGWIN* ]]; then
    DEFAULT_FFMPEG_BUILD_NAME="$(basename "$MINGW_PREFIX")"
elif [ "$BUILD_OS" = "Darwin" ]; then
    DEFAULT_FFMPEG_BUILD_NAME="macos-$BUILD_TARGET_MACHINE"
else
    DEFAULT_FFMPEG_BUILD_NAME="linux-$FFMPEG_ARCH"
fi
FFMPEG_BUILD_NAME="${FFMPEG_BUILD_NAME:-$DEFAULT_FFMPEG_BUILD_NAME}"
FFMPEG_PREFIX="${FFMPEG_PREFIX:-$VENDOR_DIR/ffmpeg-build/$FFMPEG_BUILD_NAME}"
DAV1D_PREFIX="${DAV1D_PREFIX:-$FFMPEG_PREFIX}"
FFMPEG_JOBS="${FFMPEG_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)}"
FFMPEG_CC="${FFMPEG_CC:-cc}"
FFMPEG_CXX="${FFMPEG_CXX:-c++}"
DAV1D_MESON_CROSS_ARGS=()
FFMPEG_CROSS_ARGS=()

FFMPEG_SOURCE_URL="https://github.com/FFmpeg/FFmpeg/archive/refs/tags/n8.1.tar.gz"
DAV1D_SOURCE_URL="https://github.com/videolan/dav1d/archive/refs/tags/1.5.3.tar.gz"

TARGET_OS="linux"
STRIP_PATTERN="*.so*"
if [[ "$BUILD_OS" == MINGW* || "$BUILD_OS" == MSYS* || "$BUILD_OS" == CYGWIN* ]]; then
    TARGET_OS="mingw32"
    STRIP_PATTERN="*.dll"

    if [ ! -d "$MINGW_PREFIX" ]; then
        echo "Missing mingw prefix: $MINGW_PREFIX" >&2
        echo "Run this script under MSYS2 MINGW64 environment." >&2
        exit 1
    fi

    export PATH="$MINGW_PREFIX/bin:$PATH"
    export PKG_CONFIG="${PKG_CONFIG:-$MINGW_PREFIX/bin/pkg-config}"
    PKG_CONFIG_SYSTEM_PATH="$MINGW_PREFIX/lib/pkgconfig:$MINGW_PREFIX/share/pkgconfig"
    export PKG_CONFIG_PATH="$PKG_CONFIG_SYSTEM_PATH:${PKG_CONFIG_PATH:-}"
    export PKG_CONFIG_LIBDIR="$PKG_CONFIG_SYSTEM_PATH"
else
    export PKG_CONFIG="${PKG_CONFIG:-pkg-config}"
    PKG_CONFIG_SYSTEM_PATH="/usr/local/lib/pkgconfig:/usr/local/share/pkgconfig"
    export PKG_CONFIG_PATH="$PKG_CONFIG_SYSTEM_PATH:${PKG_CONFIG_PATH:-}"
fi

if [ "$BUILD_OS" = "Darwin" ]; then
    TARGET_OS="darwin"
    STRIP_PATTERN="*.dylib"
    VCPKG_INSTALLED_DIR="${VCPKG_INSTALLED_DIR:-$PROJECT_ROOT/vcpkg_installed}"
    if [ -z "${VCPKG_TARGET_TRIPLET:-}" ]; then
        case "$BUILD_TARGET_MACHINE" in
            arm64) VCPKG_TARGET_TRIPLET="arm64-osx-mp" ;;
            x86_64) VCPKG_TARGET_TRIPLET="x64-osx-mp" ;;
        esac
    fi
    VCPKG_PREFIX="$VCPKG_INSTALLED_DIR/$VCPKG_TARGET_TRIPLET"
    if [ -d "$VCPKG_PREFIX" ]; then
        PKG_CONFIG_SYSTEM_PATH="$VCPKG_PREFIX/lib/pkgconfig:$VCPKG_PREFIX/share/pkgconfig:$PKG_CONFIG_SYSTEM_PATH"
        export PKG_CONFIG_PATH="$PKG_CONFIG_SYSTEM_PATH:${PKG_CONFIG_PATH:-}"
        export PKG_CONFIG_LIBDIR="$PKG_CONFIG_SYSTEM_PATH"
    fi
    if [ -z "${MACOSX_DEPLOYMENT_TARGET:-}" ]; then
        export MACOSX_DEPLOYMENT_TARGET="13.0"
    fi
    MIN_OS_FLAG="-mmacosx-version-min=${MACOSX_DEPLOYMENT_TARGET}"
    ARCH_FLAG="-arch ${BUILD_TARGET_MACHINE}"
    export CFLAGS="$ARCH_FLAG $MIN_OS_FLAG ${CFLAGS:-}"
    export CXXFLAGS="$ARCH_FLAG $MIN_OS_FLAG ${CXXFLAGS:-}"
    export LDFLAGS="$ARCH_FLAG $MIN_OS_FLAG ${LDFLAGS:-}"

    if [ "$BUILD_TARGET_MACHINE" != "$BUILD_MACHINE" ]; then
        case "$BUILD_TARGET_MACHINE" in
            arm64) MESON_CPU_FAMILY="aarch64" ;;
            x86_64) MESON_CPU_FAMILY="x86_64" ;;
            *)
                echo "Unsupported macOS cross target architecture: $BUILD_TARGET_MACHINE" >&2
                exit 1
                ;;
        esac
        CROSS_FILE="$VENDOR_DIR/meson-ffmpeg-cross-${BUILD_TARGET_MACHINE}.ini"
        cat > "$CROSS_FILE" <<EOF
[binaries]
c = '$FFMPEG_CC'
cpp = '$FFMPEG_CXX'
ar = 'ar'
strip = 'strip'
pkg-config = '$PKG_CONFIG'

[host_machine]
system = 'darwin'
cpu_family = '${MESON_CPU_FAMILY}'
cpu = '${BUILD_TARGET_MACHINE}'
endian = 'little'

[properties]
needs_exe_wrapper = true
EOF
        DAV1D_MESON_CROSS_ARGS+=(--cross-file "$CROSS_FILE")
        FFMPEG_CROSS_ARGS+=(
            --enable-cross-compile
            --host-cc=cc
        )
    fi
fi

# Airwave: cache skip-guard. FFmpeg is the slow step (~20-30 min); when CI restores
# a matching ffmpeg-build cache, this stamp lets us skip the whole recompile.
FFMPEG_BUILD_STAMP="$FFMPEG_PREFIX/.airwave-ffmpeg-build"
FFMPEG_BUILD_ID="ffmpeg-n8.1_dav1d-1.5.3_${FFMPEG_BUILD_NAME}_${FFMPEG_ARCH}"
if [ -f "$FFMPEG_BUILD_STAMP" ] && [ "$(cat "$FFMPEG_BUILD_STAMP" 2>/dev/null)" = "$FFMPEG_BUILD_ID" ]; then
    echo "FFmpeg already built ($FFMPEG_BUILD_ID) at $FFMPEG_PREFIX — skipping (cache hit)."
    exit 0
fi

for tool in curl tar make meson ninja pkg-config strip "$FFMPEG_CC" "$FFMPEG_CXX"; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "$tool not found in PATH" >&2
        exit 1
    fi
done

rm -rf "$FFMPEG_PREFIX"
mkdir -p "$FFMPEG_PREFIX"

rm -rf "$DAV1D_DIR"
mkdir -p "$DAV1D_DIR"
curl --fail --location --retry 3 --retry-delay 2 --output "$DAV1D_TARBALL" "$DAV1D_SOURCE_URL"
tar -zxf "$DAV1D_TARBALL" -C "$DAV1D_DIR" --strip-components=1

echo "Building dav1d static library with prefix=$DAV1D_PREFIX"
CC="$FFMPEG_CC" CXX="$FFMPEG_CXX" meson setup "$DAV1D_DIR/buildout" "$DAV1D_DIR" \
    --buildtype=release \
    --default-library=static \
    --prefix="$DAV1D_PREFIX" \
    --libdir=lib \
    -Db_staticpic=true \
    -Denable_tools=false \
    -Denable_tests=false \
    "${DAV1D_MESON_CROSS_ARGS[@]}"
meson compile -C "$DAV1D_DIR/buildout" -j "$FFMPEG_JOBS"
meson install -C "$DAV1D_DIR/buildout"

export PKG_CONFIG_PATH="$DAV1D_PREFIX/lib/pkgconfig:$PKG_CONFIG_SYSTEM_PATH:${PKG_CONFIG_PATH:-}"
if [[ "$TARGET_OS" == "mingw32" ]]; then
    export PKG_CONFIG_LIBDIR="$DAV1D_PREFIX/lib/pkgconfig:$PKG_CONFIG_SYSTEM_PATH"
fi

if ! "$PKG_CONFIG" --exists dav1d; then
    echo "dav1d pkg-config file not found after source build" >&2
    exit 1
fi

rm -rf "$FFMPEG_DIR"
mkdir -p "$FFMPEG_DIR"
curl --fail --location --retry 3 --retry-delay 2 --output "$FFMPEG_TARBALL" "$FFMPEG_SOURCE_URL"
tar -zxf "$FFMPEG_TARBALL" -C "$FFMPEG_DIR" --strip-components=1

pushd "$FFMPEG_DIR"

CONFIGURE_ARGS=(
    --prefix="$FFMPEG_PREFIX"
    --target-os="$TARGET_OS"
    --arch="$FFMPEG_ARCH"
    --cc="$FFMPEG_CC"
    --cxx="$FFMPEG_CXX"
    --pkg-config="$PKG_CONFIG"
    --pkg-config-flags=--static
    --enable-shared
    --enable-small
    --disable-static
    --disable-debug
    --disable-doc
    --disable-programs
    --disable-openssl
    --disable-encoders
    --enable-encoder=mjpeg
    --disable-muxers
    --enable-gpl
    --enable-libass
    --enable-libdav1d
    --enable-libopus
    --enable-librubberband
    --enable-bzlib
    --enable-lzma
    --enable-zlib
    "${FFMPEG_CROSS_ARGS[@]}"
)

if [ "$TARGET_OS" != "mingw32" ]; then
    CONFIGURE_ARGS+=(
        --enable-pic
    )
fi

echo "Configuring FFmpeg with prefix=$FFMPEG_PREFIX"
if ! ./configure "${CONFIGURE_ARGS[@]}"; then
    if [ -f ffbuild/config.log ]; then
        echo "==== ffbuild/config.log ====" >&2
        cat ffbuild/config.log >&2
        echo "==== end ffbuild/config.log ====" >&2
    fi
    exit 1
fi

echo "Building FFmpeg with jobs=$FFMPEG_JOBS"
make -j"$FFMPEG_JOBS"
make install

echo "Stripping FFmpeg runtime libraries..."
find "$FFMPEG_PREFIX" -name "$STRIP_PATTERN" -type f -exec strip --strip-unneeded {} + 2>/dev/null || true

popd

printf '%s' "$FFMPEG_BUILD_ID" > "$FFMPEG_BUILD_STAMP"
echo "FFmpeg build output ready in: $FFMPEG_PREFIX"
