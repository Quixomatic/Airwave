#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VCPKG_ROOT="${VCPKG_ROOT:-$PROJECT_ROOT/vcpkg}"
VCPKG_INSTALLED_DIR="${VCPKG_INSTALLED_DIR:-$PROJECT_ROOT/vcpkg_installed}"
VCPKG_TARGET_TRIPLET="${VCPKG_TARGET_TRIPLET:-}"
OVERLAY_TRIPLETS_DIR="$PROJECT_ROOT/vcpkg-triplets"
OVERLAY_PORTS_DIR="$PROJECT_ROOT/vcpkg-ports"
X64_OVERLAY_PORTS_DIR="$PROJECT_ROOT/vcpkg-ports-x64"

if [ "${VCPKG_SKIP_BOOTSTRAP:-0}" != "1" ]; then
    bash "$PROJECT_ROOT/bootstrap-vcpkg.sh"
fi

if [ -z "$VCPKG_TARGET_TRIPLET" ]; then
    case "$(uname -m)" in
        arm64)
            VCPKG_TARGET_TRIPLET="arm64-osx-mp"
            ;;
        x86_64)
            VCPKG_TARGET_TRIPLET="x64-osx-mp"
            ;;
        *)
            echo "Unsupported host architecture for default triplet: $(uname -m)" >&2
            exit 1
            ;;
    esac
fi

if [ ! -x "$VCPKG_ROOT/vcpkg" ]; then
    echo "Missing vcpkg executable at $VCPKG_ROOT/vcpkg" >&2
    echo "Run vcpkg bootstrap first." >&2
    exit 1
fi

if [ "$(uname -s)" = "Darwin" ]; then
    missing_tools=()
    command -v autoconf >/dev/null 2>&1 || missing_tools+=("autoconf")
    command -v automake >/dev/null 2>&1 || missing_tools+=("automake")
    command -v aclocal >/dev/null 2>&1 || missing_tools+=("automake")
    if command -v libtoolize >/dev/null 2>&1; then
        export LIBTOOLIZE="$(command -v libtoolize)"
    elif command -v glibtoolize >/dev/null 2>&1; then
        export LIBTOOLIZE="$(command -v glibtoolize)"
        TOOL_SHIM_DIR="${PROJECT_ROOT}/.cache/tool-shims"
        mkdir -p "$TOOL_SHIM_DIR"
        ln -sf "$LIBTOOLIZE" "$TOOL_SHIM_DIR/libtoolize"
        export PATH="$TOOL_SHIM_DIR:$PATH"
        export LIBTOOLIZE="$TOOL_SHIM_DIR/libtoolize"
    else
        missing_tools+=("libtool")
    fi

    if [ "${#missing_tools[@]}" -gt 0 ]; then
        echo "Missing required system build tools: ${missing_tools[*]}" >&2
        echo "Install them first: brew install autoconf autoconf-archive automake libtool" >&2
        exit 1
    fi

    echo "Using LIBTOOLIZE=$LIBTOOLIZE"

    # Match vcpkg's aclocal/autoconf-archive preflight behavior early so
    # we fail fast with a clear hint instead of failing during a port build.
    ACLOCAL_CHECK_DIR="${PROJECT_ROOT}/.cache/aclocal-check"
    rm -rf "$ACLOCAL_CHECK_DIR"
    mkdir -p "$ACLOCAL_CHECK_DIR"
    cat > "$ACLOCAL_CHECK_DIR/configure.ac" <<'EOF'
AC_INIT([check-autoconf], [1.0])
AM_INIT_AUTOMAKE
LT_INIT
AX_PTHREAD
EOF

    ACLOCAL_ERR_LOG="$ACLOCAL_CHECK_DIR/aclocal.err.log"
    if ! (cd "$ACLOCAL_CHECK_DIR" && aclocal --dry-run > /dev/null 2>"$ACLOCAL_ERR_LOG"); then
        cat "$ACLOCAL_ERR_LOG" >&2 || true
        echo "aclocal preflight failed. Install required tools: brew install autoconf autoconf-archive automake libtool" >&2
        exit 1
    fi
    if grep -Eiq "autoconf-archive.*missing" "$ACLOCAL_ERR_LOG"; then
        cat "$ACLOCAL_ERR_LOG" >&2 || true
        echo "autoconf-archive is required by vcpkg ports (for AX_* macros)." >&2
        echo "Install it with: brew install autoconf-archive" >&2
        exit 1
    fi
fi

DYNAMIC_PORTS=(
    luajit
    libarchive
    freetype
    fribidi
    harfbuzz
    lcms
    libass
    uchardet
    vulkan
    libbluray
    libdvdnav
    opus
    rubberband
    libjpeg-turbo
    libiconv
    shaderc
    libplacebo
)

UNAVAILABLE_OPTIONAL_PORTS=(
    libcaca
    libcdio
    zimg
)

for port in "${UNAVAILABLE_OPTIONAL_PORTS[@]}"; do
    if [ ! -d "$VCPKG_ROOT/ports/$port" ]; then
        echo "Skipping unavailable optional port in current vcpkg baseline: $port"
    fi
done

DYNAMIC_SPECS=()
OVERLAY_PORT_ARGS=(
    --overlay-ports="$OVERLAY_PORTS_DIR"
)

if [ "$VCPKG_TARGET_TRIPLET" = "x64-osx-mp" ]; then
    OVERLAY_PORT_ARGS+=(--overlay-ports="$X64_OVERLAY_PORTS_DIR")
fi

for port in "${DYNAMIC_PORTS[@]}"; do
    DYNAMIC_SPECS+=("${port}:${VCPKG_TARGET_TRIPLET}")
done

if [ "${#DYNAMIC_SPECS[@]}" -gt 0 ]; then
    echo "Installing dynamic ports with triplet: $VCPKG_TARGET_TRIPLET"
    echo "Dynamic ports: ${DYNAMIC_PORTS[*]}"
    "$VCPKG_ROOT/vcpkg" install \
        --recurse \
        "${OVERLAY_PORT_ARGS[@]}" \
        --overlay-triplets="$OVERLAY_TRIPLETS_DIR" \
        --x-install-root="$VCPKG_INSTALLED_DIR" \
        "${DYNAMIC_SPECS[@]}"
fi

if [ "${#DYNAMIC_SPECS[@]}" -eq 0 ]; then
    echo "No ports to install." >&2
    exit 1
fi
