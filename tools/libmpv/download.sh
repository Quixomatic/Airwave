#!/usr/bin/env bash
#
# Airwave libmpv build — download vanilla mpv source.
#
# Adapted from FengZeng/mpv (GPL; see LICENSE). Their download.sh patches mpv to
# add a soia-specific Vulkan render context (`ra_ctx_vulkan_soia`, macOS-only) and
# export `ra_vk_ctx_init/uninit` for their proprietary `soia_utils` helper. We build
# VANILLA libmpv (no soia_utils), so that patch is intentionally omitted.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="$PROJECT_ROOT/vendor"
MPV_DIR="$VENDOR_DIR/mpv"
MPV_VERSION="${MPV_VERSION:-0.41.0}"
VERSION_FILE="$MPV_DIR/.mpv-version"
TARBALL="$VENDOR_DIR/mpv-v${MPV_VERSION}.tar.gz"
SOURCE_URL="https://github.com/mpv-player/mpv/archive/refs/tags/v${MPV_VERSION}.tar.gz"

mkdir -p "$VENDOR_DIR"

if [ -f "$VERSION_FILE" ] && [ "$(cat "$VERSION_FILE")" = "$MPV_VERSION" ]; then
    echo "mpv v${MPV_VERSION} already exists at $MPV_DIR"
    exit 0
fi

echo "Downloading vanilla mpv v${MPV_VERSION}..."
rm -rf "$MPV_DIR"
mkdir -p "$MPV_DIR"
curl --fail --location --retry 3 --retry-delay 2 --output "$TARBALL" "$SOURCE_URL"
tar -zxf "$TARBALL" -C "$MPV_DIR" --strip-components=1
echo "$MPV_VERSION" > "$VERSION_FILE"
rm -f "$TARBALL"
echo "Done: $MPV_DIR"
