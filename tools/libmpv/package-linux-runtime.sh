#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${PROJECT_ROOT}/vendor/mpv/buildout"
SOIA_UTILS_DIR="${PROJECT_ROOT}/vendor/soia_utils"
CONFIG_DATA_SRC="${PROJECT_ROOT}/vendor/config.data"
OUT_DIR="${PROJECT_ROOT}/release"
PKG_NAME=""
DEFAULT_PKG_NAME="libmpv-local-linux"
ORIGINAL_ARGC="$#"
BUILD_MACHINE="$(uname -m)"
case "$BUILD_MACHINE" in
  arm64) FFMPEG_BUILD_ARCH="aarch64" ;;
  *) FFMPEG_BUILD_ARCH="$BUILD_MACHINE" ;;
esac
FFMPEG_BUILD_NAME="${FFMPEG_BUILD_NAME:-linux-$FFMPEG_BUILD_ARCH}"
FFMPEG_PREFIX="${FFMPEG_PREFIX:-$PROJECT_ROOT/vendor/ffmpeg-build/$FFMPEG_BUILD_NAME}"

usage() {
  cat <<'USAGE'
Usage:
  bash ./package-linux-runtime.sh --pkg-name <name> [--build-dir <dir>] [--out-dir <dir>]

Build a self-contained Linux runtime package:
  - libmpv shared libraries (.so*)
  - all runtime shared library dependencies except core glibc/loader libs (recursive)
  - runtime search path rewritten to $ORIGIN (when patchelf is available)
  - SHA256 checksum
Defaults:
  (no args) --pkg-name libmpv-local-linux
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --build-dir)
      BUILD_DIR="$2"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="$2"
      shift 2
      ;;
    --pkg-name)
      PKG_NAME="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ -z "$PKG_NAME" ]; then
  if [ "$ORIGINAL_ARGC" -eq 0 ]; then
    PKG_NAME="$DEFAULT_PKG_NAME"
  else
    echo "--pkg-name is required" >&2
    usage
    exit 1
  fi
fi

if [ ! -d "$BUILD_DIR" ]; then
  echo "Build directory not found: $BUILD_DIR" >&2
  exit 1
fi

if ! command -v readelf >/dev/null 2>&1; then
  echo "readelf not found in PATH" >&2
  exit 1
fi

LIB_DIR="$OUT_DIR/lib"
mkdir -p "$LIB_DIR"
rm -f "$LIB_DIR"/*

TMP_DIR="$(mktemp -d)"
VISITED_FILE="${TMP_DIR}/visited.txt"
touch "$VISITED_FILE"
trap 'rm -rf "$TMP_DIR"' EXIT

already_visited() {
  grep -Fqx -- "$1" "$VISITED_FILE"
}

mark_visited() {
  printf '%s\n' "$1" >> "$VISITED_FILE"
}

canonical_path() {
  readlink -f "$1" 2>/dev/null || realpath "$1"
}

list_needed_deps() {
  readelf -d "$1" 2>/dev/null | awk '
    /\(NEEDED\)/ {
      line=$0
      sub(/^.*\[/, "", line)
      sub(/\].*$/, "", line)
      if (line != "") print line
    }'
}

list_rpaths() {
  readelf -d "$1" 2>/dev/null | awk -F'[][]' '
    /\(RPATH\)|\(RUNPATH\)/ {
      if ($2 != "") print $2
    }'
}

is_system_dep_path() {
  case "$(basename "$1")" in
    linux-vdso.so.1)
      return 0
      ;;
    ld-linux-x86-64.so.2|ld-linux-aarch64.so.1|ld-linux.so.2)
      return 0
      ;;
    libc.so.6|libm.so.6|libdl.so.2|libpthread.so.0|librt.so.1|libresolv.so.2)
      return 0
      ;;
    libEGL.so.1)
      return 0
      ;;
    libnsl.so.1|libutil.so.1|libcrypt.so.1)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

resolve_dep() {
  local owner="$1"
  local dep="$2"
  local owner_dir candidate rpath expanded path_dir arch_dir
  owner_dir="$(cd "$(dirname "$owner")" && pwd)"
  arch_dir="$(uname -m)-linux-gnu"

  case "$dep" in
    /*)
      [ -e "$dep" ] && { echo "$dep"; return 0; }
      ;;
  esac

  if [[ "$dep" == */* ]]; then
    candidate="${owner_dir}/${dep}"
    [ -e "$candidate" ] && { echo "$candidate"; return 0; }
  fi

  while IFS= read -r rpath; do
    [ -n "$rpath" ] || continue
    IFS=':' read -r -a _rpaths <<< "$rpath"
    for expanded in "${_rpaths[@]}"; do
      [ -n "$expanded" ] || continue
      expanded="${expanded//\$\{ORIGIN\}/$owner_dir}"
      expanded="${expanded//\$ORIGIN/$owner_dir}"
      candidate="${expanded}/${dep}"
      [ -e "$candidate" ] && { echo "$candidate"; return 0; }
    done
  done < <(list_rpaths "$owner")

  for path_dir in \
    "$owner_dir" \
    "$LIB_DIR" \
    "$BUILD_DIR" \
    "$FFMPEG_PREFIX/lib" \
    "/usr/local/lib" \
    "/usr/lib/${arch_dir}" \
    "/lib/${arch_dir}" \
    "/usr/lib64" \
    "/lib64" \
    "/usr/lib" \
    "/lib"; do
    [ -n "$path_dir" ] || continue
    candidate="${path_dir}/${dep}"
    [ -e "$candidate" ] && { echo "$candidate"; return 0; }
  done

  OLD_IFS="$IFS"
  IFS=':'
  for path_dir in ${LD_LIBRARY_PATH:-}; do
    [ -n "$path_dir" ] || continue
    candidate="${path_dir}/${dep}"
    if [ -e "$candidate" ]; then
      IFS="$OLD_IFS"
      echo "$candidate"
      return 0
    fi
  done
  IFS="$OLD_IFS"

  return 1
}

scan_and_copy_deps() {
  local owner="$1"
  local owner_canonical dep resolved dep_name target

  [ -e "$owner" ] || return 0
  owner_canonical="$(canonical_path "$owner")"
  if already_visited "$owner_canonical"; then
    return 0
  fi
  mark_visited "$owner_canonical"

  while IFS= read -r dep; do
    [ -n "$dep" ] || continue

    if is_system_dep_path "$dep"; then
      continue
    fi

    if ! resolved="$(resolve_dep "$owner" "$dep")"; then
      echo "Unresolved non-system dependency: $dep (owner: $owner)" >&2
      return 1
    fi

    dep_name="$(basename "$dep")"
    target="${LIB_DIR}/${dep_name}"
    if [ ! -e "$target" ]; then
      cp -vL "$resolved" "$target"
      chmod u+w "$target" || true
    fi

    scan_and_copy_deps "$target"
  done < <(list_needed_deps "$owner")
}

rewrite_rpath_if_possible() {
  local file
  if ! command -v patchelf >/dev/null 2>&1; then
    echo "Warning: patchelf not found; skip RPATH rewrite to \$ORIGIN." >&2
    return 0
  fi

  for file in "$LIB_DIR"/*.so*; do
    [ -f "$file" ] || continue
    [ -L "$file" ] && continue
    patchelf --set-rpath '$ORIGIN' "$file"
  done
}

strip_shared_libs_if_possible() {
  local file
  if ! command -v strip >/dev/null 2>&1; then
    echo "Warning: strip not found; skip symbol stripping." >&2
    return 0
  fi

  for file in "$LIB_DIR"/*.so*; do
    [ -f "$file" ] || continue
    [ -L "$file" ] && continue
    strip --strip-unneeded "$file" 2>/dev/null || strip "$file" || true
  done
}

verify_deps_resolved() {
  local file dep dep_name

  for file in "$LIB_DIR"/*.so*; do
    [ -e "$file" ] || continue
    while IFS= read -r dep; do
      [ -n "$dep" ] || continue

      if is_system_dep_path "$dep"; then
        continue
      fi

      dep_name="$(basename "$dep")"
      if [ -e "$LIB_DIR/$dep_name" ]; then
        continue
      fi

      echo "Packaged dependency missing: $dep (owner: $file)" >&2
      return 1
    done < <(list_needed_deps "$file")
  done
}

copy_root_mpv_libs() {
  local found=0
  local src
  shopt -s nullglob
  for src in "$BUILD_DIR"/libmpv*.so*; do
    if [ -f "$src" ] || [ -L "$src" ]; then
      cp -vP "$src" "$LIB_DIR/"
      found=1
    fi
  done
  if [ "$found" -eq 0 ]; then
    echo "No libmpv*.so* found in $BUILD_DIR" >&2
    exit 1
  fi
}

copy_soia_utils_lib() {
  local arch triple src
  arch="$(uname -m)"
  case "$arch" in
    x86_64)
      triple="x86_64-unknown-linux-gnu"
      ;;
    aarch64|arm64)
      triple="aarch64-unknown-linux-gnu"
      ;;
    *)
      echo "Unsupported Linux architecture for soia_utils: $arch" >&2
      exit 1
      ;;
  esac

  src="${SOIA_UTILS_DIR}/${triple}/libsoia_utils.so"
  if [ ! -f "$src" ]; then
    echo "soia_utils shared library not found for ${triple}: $src" >&2
    exit 1
  fi

  cp -vP "$src" "$LIB_DIR/"
}

copy_config_data() {
  if [ ! -f "$CONFIG_DATA_SRC" ]; then
    echo "Required config file not found: $CONFIG_DATA_SRC" >&2
    exit 1
  fi

  mkdir -p "$LIB_DIR"
  cp -vP "$CONFIG_DATA_SRC" "${LIB_DIR}/config.data"
}

echo "Preparing Linux runtime bundle from: $BUILD_DIR"
copy_root_mpv_libs
copy_soia_utils_lib
copy_config_data

for file in "$LIB_DIR"/libmpv*.so* "$LIB_DIR"/libsoia_utils*.so*; do
  [ -e "$file" ] || continue
  scan_and_copy_deps "$file"
done

if [ -n "${CI:-}" ]; then
  rewrite_rpath_if_possible
  strip_shared_libs_if_possible
  verify_deps_resolved

  tar -czf "${PKG_NAME}.tar.gz" -C "$OUT_DIR" .
  sha256sum "${PKG_NAME}.tar.gz" > "${PKG_NAME}.tar.gz.sha256"

  echo "Created package: ${PKG_NAME}.tar.gz"
  echo "Created checksum: ${PKG_NAME}.tar.gz.sha256"
fi
