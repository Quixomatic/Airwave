#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="$PROJECT_ROOT/vendor"
MPV_DIR="$VENDOR_DIR/mpv"
BUILD_DIR="$MPV_DIR/buildout"
AUTO_BUILD_MOLTENVK="${AUTO_BUILD_MOLTENVK:-1}"
MOLTENVK_REPO_DIR="${MOLTENVK_REPO_DIR:-$PROJECT_ROOT/vendor/MoltenVK}"
MOLTENVK_REPO_URL="${MOLTENVK_REPO_URL:-https://github.com/KhronosGroup/MoltenVK.git}"
MOLTENVK_REF="${MOLTENVK_REF:-v1.4.0}"
MOLTENVK_CONFIGURATION="${MOLTENVK_CONFIGURATION:-Release}"
MOLTENVK_OUTPUT_DIR="${MOLTENVK_OUTPUT_DIR:-$PROJECT_ROOT/vendor/MoltenVK/Build/Release}"
MOLTENVK_LIB_PATH="${MOLTENVK_LIB_PATH:-$MOLTENVK_OUTPUT_DIR/libMoltenVK.dylib}"
MOLTENVK_ICD_PATH="${MOLTENVK_ICD_PATH:-$PROJECT_ROOT/vendor/MoltenVK/Package/Release/MoltenVK/dynamic/dylib/macOS/MoltenVK_icd.json}"
MOLTENVK_DERIVED_DATA_DIR="${MOLTENVK_DERIVED_DATA_DIR:-$MOLTENVK_REPO_DIR/Build/DerivedData}"

if [ ! -d "$MPV_DIR" ]; then
    echo "Missing mpv source: $MPV_DIR"
    echo "Run: ./download.sh"
    exit 1
fi

HOST_ARCH="$(uname -m)"
MPV_TARGET_ARCH="${MPV_TARGET_ARCH:-$HOST_ARCH}"
case "$MPV_TARGET_ARCH" in
    arm64|x86_64) ;;
    *)
        echo "Unsupported MPV_TARGET_ARCH: $MPV_TARGET_ARCH" >&2
        exit 1
        ;;
esac

VCPKG_ROOT="${VCPKG_ROOT:-$PROJECT_ROOT/vcpkg}"
VCPKG_INSTALLED_DIR="${VCPKG_INSTALLED_DIR:-$PROJECT_ROOT/vcpkg_installed}"
if [ -z "${VCPKG_TARGET_TRIPLET:-}" ]; then
    case "$MPV_TARGET_ARCH" in
        arm64)
            if [ -d "$VCPKG_INSTALLED_DIR/arm64-osx-mp" ]; then
                VCPKG_TARGET_TRIPLET="arm64-osx-mp"
            else
                VCPKG_TARGET_TRIPLET="arm64-osx"
            fi
            ;;
        x86_64)
            if [ -d "$VCPKG_INSTALLED_DIR/x64-osx-mp" ]; then
                VCPKG_TARGET_TRIPLET="x64-osx-mp"
            else
                VCPKG_TARGET_TRIPLET="x64-osx"
            fi
            ;;
    esac
fi

if [[ "$VCPKG_TARGET_TRIPLET" == *-static ]]; then
    VCPKG_STATIC_TRIPLET="$VCPKG_TARGET_TRIPLET"
    VCPKG_DYNAMIC_TRIPLET="${VCPKG_TARGET_TRIPLET%-static}"
else
    VCPKG_DYNAMIC_TRIPLET="$VCPKG_TARGET_TRIPLET"
    VCPKG_STATIC_TRIPLET="${VCPKG_TARGET_TRIPLET}-static"
fi

VCPKG_DYNAMIC_PREFIX="$VCPKG_INSTALLED_DIR/$VCPKG_DYNAMIC_TRIPLET"
VCPKG_STATIC_PREFIX="$VCPKG_INSTALLED_DIR/$VCPKG_STATIC_TRIPLET"
if [ ! -d "$VCPKG_DYNAMIC_PREFIX" ] && [ ! -d "$VCPKG_STATIC_PREFIX" ]; then
    echo "Missing vcpkg install roots for both dynamic/static triplets" >&2
    echo "Expected one of: $VCPKG_DYNAMIC_PREFIX or $VCPKG_STATIC_PREFIX" >&2
    exit 1
fi
VCPKG_PREFIX="$VCPKG_DYNAMIC_PREFIX"
if [ ! -d "$VCPKG_PREFIX" ] && [ -d "$VCPKG_STATIC_PREFIX" ]; then
    # Keep legacy VCPKG_PREFIX variable available for downstream logic.
    VCPKG_PREFIX="$VCPKG_STATIC_PREFIX"
fi

FFMPEG_BUILD_NAME="${FFMPEG_BUILD_NAME:-macos-$MPV_TARGET_ARCH}"
FFMPEG_PREFIX="${FFMPEG_PREFIX:-$PROJECT_ROOT/vendor/ffmpeg-build/$FFMPEG_BUILD_NAME}"
if [ ! -d "$FFMPEG_PREFIX" ]; then
    echo "Missing FFmpeg build prefix: $FFMPEG_PREFIX" >&2
    echo "Run: MPV_TARGET_ARCH=$MPV_TARGET_ARCH bash ./build-ffmpeg.sh" >&2
    exit 1
fi

if [ -z "${MACOSX_DEPLOYMENT_TARGET:-}" ]; then
    export MACOSX_DEPLOYMENT_TARGET="13.0"
else
    export MACOSX_DEPLOYMENT_TARGET
fi
MIN_OS_FLAG="-mmacosx-version-min=${MACOSX_DEPLOYMENT_TARGET}"
ARCH_FLAG="-arch ${MPV_TARGET_ARCH}"
SWIFT_TARGET_TRIPLE="${MPV_TARGET_ARCH}-apple-macos${MACOSX_DEPLOYMENT_TARGET}"
SWIFT_FLAGS="-target ${SWIFT_TARGET_TRIPLE}"
PKG_CONFIG_DIRS=""
if [ -d "$VCPKG_DYNAMIC_PREFIX" ]; then
    PKG_CONFIG_DIRS="$VCPKG_DYNAMIC_PREFIX/lib/pkgconfig:$VCPKG_DYNAMIC_PREFIX/share/pkgconfig:$PKG_CONFIG_DIRS"
fi
if [ -d "$VCPKG_STATIC_PREFIX" ]; then
    # Put static triplet first so pkg-config prefers static-enabled metadata when both exist.
    PKG_CONFIG_DIRS="$VCPKG_STATIC_PREFIX/lib/pkgconfig:$VCPKG_STATIC_PREFIX/share/pkgconfig:$PKG_CONFIG_DIRS"
fi
PKG_CONFIG_DIRS="$FFMPEG_PREFIX/lib/pkgconfig:$FFMPEG_PREFIX/share/pkgconfig:$PKG_CONFIG_DIRS"
export PKG_CONFIG_PATH="$PKG_CONFIG_DIRS${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
export PKG_CONFIG_LIBDIR="$PKG_CONFIG_DIRS"
if ! command -v pkg-config >/dev/null 2>&1; then
    echo "pkg-config is required but not found in PATH" >&2
    exit 1
fi
export CFLAGS="$ARCH_FLAG $MIN_OS_FLAG ${CFLAGS:-}"
export CXXFLAGS="$ARCH_FLAG $MIN_OS_FLAG ${CXXFLAGS:-}"
export OBJCFLAGS="$ARCH_FLAG $MIN_OS_FLAG ${OBJCFLAGS:-}"
export OBJCXXFLAGS="$ARCH_FLAG $MIN_OS_FLAG ${OBJCXXFLAGS:-}"
VCPKG_LIB_DIRS=""
VCPKG_INCLUDE_DIRS=""
if [ -d "$VCPKG_DYNAMIC_PREFIX" ]; then
    VCPKG_LIB_DIRS="$VCPKG_LIB_DIRS -L$VCPKG_DYNAMIC_PREFIX/lib"
    VCPKG_INCLUDE_DIRS="$VCPKG_INCLUDE_DIRS -I$VCPKG_DYNAMIC_PREFIX/include"
fi
if [ -d "$VCPKG_STATIC_PREFIX" ]; then
    # Put static libs first so the linker can resolve them before dylib fallbacks.
    VCPKG_LIB_DIRS="-L$VCPKG_STATIC_PREFIX/lib $VCPKG_LIB_DIRS"
    VCPKG_INCLUDE_DIRS="-I$VCPKG_STATIC_PREFIX/include $VCPKG_INCLUDE_DIRS"
fi
export LDFLAGS="$VCPKG_LIB_DIRS $ARCH_FLAG $MIN_OS_FLAG ${LDFLAGS:-}"
export CPPFLAGS="$VCPKG_INCLUDE_DIRS ${CPPFLAGS:-}"
export XDG_CACHE_HOME="$PROJECT_ROOT/.cache"
export CLANG_MODULE_CACHE_PATH="$XDG_CACHE_HOME/clang-module-cache"
export SWIFT_MODULECACHE_PATH="$XDG_CACHE_HOME/swift-module-cache"
mkdir -p "$CLANG_MODULE_CACHE_PATH" "$SWIFT_MODULECACHE_PATH"

normalize_vulkan_install_name() {
    local vulkan_real_lib=""
    local vulkan_alias_lib="$VCPKG_PREFIX/lib/libvulkan.1.dylib"
    local vulkan_soname="@rpath/libvulkan.1.dylib"

    if [ -L "$vulkan_alias_lib" ]; then
        local resolved_alias
        resolved_alias="$(readlink "$vulkan_alias_lib" || true)"
        if [ -n "$resolved_alias" ]; then
            if [[ "$resolved_alias" = /* ]]; then
                vulkan_real_lib="$resolved_alias"
            else
                vulkan_real_lib="$VCPKG_PREFIX/lib/$resolved_alias"
            fi
        fi
    fi

    if [ -z "$vulkan_real_lib" ] || [ ! -f "$vulkan_real_lib" ]; then
        local candidates=("$VCPKG_PREFIX"/lib/libvulkan.1.*.dylib)
        if [ -e "${candidates[0]}" ]; then
            vulkan_real_lib="${candidates[0]}"
        fi
    fi

    if [ -z "$vulkan_real_lib" ] || [ ! -f "$vulkan_real_lib" ]; then
        return
    fi

    local current_id
    current_id="$(otool -D "$vulkan_real_lib" 2>/dev/null | sed -n '2p' | tr -d '[:space:]')"
    if [ "$current_id" = "$vulkan_soname" ]; then
        echo "Vulkan install_name already normalized: $current_id"
        return
    fi

    echo "Normalizing Vulkan install_name: $current_id -> $vulkan_soname"
    install_name_tool -id "$vulkan_soname" "$vulkan_real_lib"
}

normalize_libplacebo_install_name() {
    local placebo_real_lib=""
    local placebo_alias_lib="$VCPKG_PREFIX/lib/libplacebo.dylib"
    local placebo_soname="@rpath/libplacebo.dylib"

    if [ -L "$placebo_alias_lib" ]; then
        local resolved_alias
        resolved_alias="$(readlink "$placebo_alias_lib" || true)"
        if [ -n "$resolved_alias" ]; then
            if [[ "$resolved_alias" = /* ]]; then
                placebo_real_lib="$resolved_alias"
            else
                placebo_real_lib="$VCPKG_PREFIX/lib/$resolved_alias"
            fi
        fi
    fi

    if [ -z "$placebo_real_lib" ] || [ ! -f "$placebo_real_lib" ]; then
        local candidates=("$VCPKG_PREFIX"/lib/libplacebo.*.dylib)
        if [ -e "${candidates[0]}" ]; then
            placebo_real_lib="${candidates[0]}"
        fi
    fi

    if [ -z "$placebo_real_lib" ] || [ ! -f "$placebo_real_lib" ]; then
        return
    fi

    local current_id
    current_id="$(otool -D "$placebo_real_lib" 2>/dev/null | sed -n '2p' | tr -d '[:space:]')"
    if [ "$current_id" = "$placebo_soname" ]; then
        echo "libplacebo install_name already normalized: $current_id"
        return
    fi

    echo "Normalizing libplacebo install_name: $current_id -> $placebo_soname"
    install_name_tool -id "$placebo_soname" "$placebo_real_lib"
}

ensure_moltenvk_runtime() {
    local pkg_project
    local moltenvk_lib_found=""
    local moltenvk_icd_found=""

    if [ "$AUTO_BUILD_MOLTENVK" = "0" ]; then
        echo "Skipping MoltenVK auto-build (AUTO_BUILD_MOLTENVK=0)"
        return
    fi

    if ! command -v git >/dev/null 2>&1; then
        echo "Missing required tool for MoltenVK build: git" >&2
        exit 1
    fi
    if ! command -v xcodebuild >/dev/null 2>&1; then
        echo "Missing required tool for MoltenVK build: xcodebuild" >&2
        exit 1
    fi

    if [ ! -f "$MOLTENVK_LIB_PATH" ] || [ ! -f "$MOLTENVK_ICD_PATH" ]; then
        echo "MoltenVK runtime artifacts missing; building them now..."
    else
        echo "Refreshing MoltenVK runtime artifacts..."
    fi

    mkdir -p "$(dirname "$MOLTENVK_REPO_DIR")"
    if [ ! -d "$MOLTENVK_REPO_DIR/.git" ]; then
        echo "Cloning MoltenVK into $MOLTENVK_REPO_DIR"
        git clone --recursive "$MOLTENVK_REPO_URL" "$MOLTENVK_REPO_DIR"
    fi

    echo "Updating MoltenVK repository"
    git -C "$MOLTENVK_REPO_DIR" fetch --tags --prune
    git -C "$MOLTENVK_REPO_DIR" checkout "$MOLTENVK_REF"
    git -C "$MOLTENVK_REPO_DIR" submodule update --init --recursive

    if [ -x "$MOLTENVK_REPO_DIR/fetchDependencies" ]; then
        echo "Running MoltenVK dependency fetch script"
        (cd "$MOLTENVK_REPO_DIR" && ./fetchDependencies --macos)
    fi

    pkg_project="$MOLTENVK_REPO_DIR/MoltenVKPackaging.xcodeproj"
    if [ ! -d "$pkg_project" ]; then
        echo "MoltenVK packaging project not found: $pkg_project" >&2
        exit 1
    fi

    echo "Building MoltenVK (configuration=$MOLTENVK_CONFIGURATION, arch=$MPV_TARGET_ARCH)"
    xcodebuild \
        -project "$pkg_project" \
        -scheme "MoltenVK Package (macOS only)" \
        -configuration "$MOLTENVK_CONFIGURATION" \
        -arch "$MPV_TARGET_ARCH" \
        -derivedDataPath "$MOLTENVK_DERIVED_DATA_DIR" \
        build

    if [ -f "$MOLTENVK_LIB_PATH" ]; then
        moltenvk_lib_found="$MOLTENVK_LIB_PATH"
    elif [ -f "$PROJECT_ROOT/vendor/MoltenVK/Package/Release/MoltenVK/dynamic/dylib/macOS/libMoltenVK.dylib" ]; then
        moltenvk_lib_found="$PROJECT_ROOT/vendor/MoltenVK/Package/Release/MoltenVK/dynamic/dylib/macOS/libMoltenVK.dylib"
    elif [ -f "$MOLTENVK_OUTPUT_DIR/lib/libMoltenVK.dylib" ]; then
        moltenvk_lib_found="$MOLTENVK_OUTPUT_DIR/lib/libMoltenVK.dylib"
    elif [ -f "$MOLTENVK_DERIVED_DATA_DIR/Build/Products/Release/libMoltenVK.dylib" ]; then
        moltenvk_lib_found="$MOLTENVK_DERIVED_DATA_DIR/Build/Products/Release/libMoltenVK.dylib"
    fi

    if [ -z "$moltenvk_lib_found" ]; then
        echo "Failed to find MoltenVK output: libMoltenVK.dylib (checked Build/Release and Package/Release paths)" >&2
        exit 1
    fi
    echo "Using MoltenVK library: $moltenvk_lib_found"

    if [ -f "$MOLTENVK_ICD_PATH" ]; then
        moltenvk_icd_found="$MOLTENVK_ICD_PATH"
    elif [ -f "$PROJECT_ROOT/vendor/MoltenVK/MoltenVK/icd/MoltenVK_icd.json" ]; then
        moltenvk_icd_found="$PROJECT_ROOT/vendor/MoltenVK/MoltenVK/icd/MoltenVK_icd.json"
    fi

    if [ -z "$moltenvk_icd_found" ]; then
        echo "Failed to find MoltenVK output: MoltenVK_icd.json" >&2
        exit 1
    fi
    echo "Using MoltenVK ICD json: $moltenvk_icd_found"
}

cd "$MPV_DIR"
echo "Building for arch=$MPV_TARGET_ARCH on host=$HOST_ARCH"
echo "Using vcpkg triplet=$VCPKG_TARGET_TRIPLET"
echo "Using vcpkg dynamic triplet=$VCPKG_DYNAMIC_TRIPLET (exists: $([ -d "$VCPKG_DYNAMIC_PREFIX" ] && echo yes || echo no))"
echo "Using vcpkg static triplet=$VCPKG_STATIC_TRIPLET (exists: $([ -d "$VCPKG_STATIC_PREFIX" ] && echo yes || echo no))"
echo "Using vcpkg root=$VCPKG_ROOT"
echo "Using PKG_CONFIG_PATH=$PKG_CONFIG_PATH"
echo "Building with MACOSX_DEPLOYMENT_TARGET=$MACOSX_DEPLOYMENT_TARGET"
echo "Building with Swift target=$SWIFT_TARGET_TRIPLE"
ensure_moltenvk_runtime
normalize_vulkan_install_name
# normalize_libplacebo_install_name

MESON_ARGS=(
    --buildtype=release
    -Dlibmpv=true
    -Dcplayer=false
    -Dmacos-media-player=enabled
    -Dcoreaudio=enabled
    -Dvulkan=enabled
    -Dlua=enabled
    -Dswift-build=enabled
    "-Dswift-flags=${SWIFT_FLAGS}"
)

MESON_CROSS_ARGS=()
if [ "$MPV_TARGET_ARCH" != "$HOST_ARCH" ]; then
    case "$MPV_TARGET_ARCH" in
        arm64) MESON_CPU_FAMILY="aarch64" ;;
        x86_64) MESON_CPU_FAMILY="x86_64" ;;
    esac
    CROSS_FILE="$XDG_CACHE_HOME/meson-cross-${MPV_TARGET_ARCH}.ini"
    cat > "$CROSS_FILE" <<EOF
[binaries]
c = 'clang'
cpp = 'clang++'
objc = 'clang'
objcpp = 'clang++'
ar = 'ar'
strip = 'strip'
pkg-config = 'pkg-config'
swift = 'swiftc'

[host_machine]
system = 'darwin'
cpu_family = '${MESON_CPU_FAMILY}'
cpu = '${MPV_TARGET_ARCH}'
endian = 'little'

[properties]
needs_exe_wrapper = true
EOF
    MESON_CROSS_ARGS+=(--cross-file "$CROSS_FILE")
fi

if [ ! -d "$BUILD_DIR" ]; then
    echo "Configuring Meson..."
    if [ "${#MESON_CROSS_ARGS[@]}" -gt 0 ]; then
        meson setup buildout "${MESON_ARGS[@]}" "${MESON_CROSS_ARGS[@]}"
    else
        meson setup buildout "${MESON_ARGS[@]}"
    fi
else
    echo "Reconfiguring Meson (wipe old options)..."
    if [ "${#MESON_CROSS_ARGS[@]}" -gt 0 ]; then
        meson setup buildout --wipe "${MESON_ARGS[@]}" "${MESON_CROSS_ARGS[@]}"
    else
        meson setup buildout --wipe "${MESON_ARGS[@]}"
    fi
fi

echo "Building..."
meson compile -C buildout

LIBMPV_DYLIB="$BUILD_DIR/libmpv.2.dylib"
if [[ "$MACOSX_DEPLOYMENT_TARGET" == 13* ]] && [ -f "$LIBMPV_DYLIB" ] &&
    nm -u "$LIBMPV_DYLIB" | grep -q '_\$ss20__StaticArrayStorageCN'; then
    echo "Detected Swift runtime symbol unsupported on macOS 13: _\\$ss20__StaticArrayStorageCN" >&2
    echo "Check swift target/deployment settings before packaging." >&2
    exit 1
fi
