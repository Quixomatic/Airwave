#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${PROJECT_ROOT}/vendor/mpv/buildout"
OUT_DIR="${PROJECT_ROOT}/release"
PKG_NAME=""
DEFAULT_PKG_NAME="libmpv-airwave-windows-mingw64-x86_64"
ORIGINAL_ARGC="$#"
MINGW_PREFIX="${MINGW_PREFIX:-/mingw64}"
FFMPEG_BUILD_NAME="${FFMPEG_BUILD_NAME:-$(basename "$MINGW_PREFIX")}"
FFMPEG_PREFIX="${FFMPEG_PREFIX:-$PROJECT_ROOT/vendor/ffmpeg-build/$FFMPEG_BUILD_NAME}"
TARGET_ARCH="${TARGET_ARCH:-}"

usage() {
  cat <<'USAGE'
Usage:
  bash ./package-mingw64-runtime.sh --pkg-name <name> [--build-dir <dir>] [--out-dir <dir>]

Build a self-contained mingw64 runtime package:
  - libmpv DLLs
  - libmpv import/static link libs (.lib/.a/.dll.a), if present
  - all non-system DLL dependencies (recursive)
  - SHA256 checksum
Defaults:
  (no args) --pkg-name libmpv-local-windows-mingw64-x86_64
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

BIN_DIR="$OUT_DIR/bin"
LIB_DIR="$OUT_DIR/lib"
mkdir -p "$BIN_DIR"
mkdir -p "$LIB_DIR"
rm -f "$BIN_DIR"/*
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

upper() {
  printf '%s' "$1" | tr '[:lower:]' '[:upper:]'
}

lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

normalize_windows_arch() {
  case "$(lower "$1")" in
    x86_64|amd64|x64|mingw64|ucrt64|clang64)
      echo "x86_64"
      ;;
    aarch64|arm64|clangarm64|clang-aarch64)
      echo "aarch64"
      ;;
    *)
      return 1
      ;;
  esac
}

infer_windows_target_arch() {
  local arch prefix_name msystem ffmpeg_name pkg_name

  if [ -n "$TARGET_ARCH" ] && normalize_windows_arch "$TARGET_ARCH"; then
    return 0
  fi

  prefix_name="$(basename "$MINGW_PREFIX")"
  if normalize_windows_arch "$prefix_name"; then
    return 0
  fi

  msystem="${MSYSTEM:-}"
  if [ -n "$msystem" ] && normalize_windows_arch "$msystem"; then
    return 0
  fi

  if [ -n "${FFMPEG_ARCH:-}" ] && normalize_windows_arch "$FFMPEG_ARCH"; then
    return 0
  fi

  ffmpeg_name="$(lower "$FFMPEG_BUILD_NAME")"
  case "$ffmpeg_name" in
    *clangarm64*|*aarch64*|*arm64*)
      echo "aarch64"
      return 0
      ;;
    *mingw64*|*x86_64*|*x64*)
      echo "x86_64"
      return 0
      ;;
  esac

  pkg_name="$(lower "$PKG_NAME")"
  case "$pkg_name" in
    *clangarm64*|*aarch64*|*arm64*)
      echo "aarch64"
      return 0
      ;;
    *mingw64*|*x86_64*|*x64*)
      echo "x86_64"
      return 0
      ;;
  esac

  normalize_windows_arch "$(uname -m)"
}

verify_windows_dll_arch() {
  local path="$1"
  local arch="$2"
  local info

  if ! command -v file >/dev/null 2>&1; then
    echo "Warning: file command not found; skipping arch check for $path" >&2
    return 0
  fi

  info="$(file "$path")"
  case "$arch" in
    x86_64)
      if [[ "$info" == *"x86-64"* ]]; then
        return 0
      fi
      ;;
    aarch64)
      if [[ "$info" == *"Aarch64"* ]] || [[ "$info" == *"ARM64"* ]]; then
        return 0
      fi
      ;;
  esac

  echo "Windows DLL arch mismatch for target ${arch}: $path" >&2
  echo "$info" >&2
  return 1
}

is_system_dep() {
  local dep_upper
  dep_upper="$(upper "$(basename "$1")")"

  case "$dep_upper" in
    API-MS-WIN-*|EXT-MS-WIN-*) return 0 ;;
    KERNEL32.DLL|NTDLL.DLL|USER32.DLL|GDI32.DLL|ADVAPI32.DLL|SHELL32.DLL)
      return 0
      ;;
    OLE32.DLL|OLEAUT32.DLL|COMDLG32.DLL|WS2_32.DLL|WINMM.DLL|IMM32.DLL)
      return 0
      ;;
    VERSION.DLL|SETUPAPI.DLL|MSVCRT.DLL|BCRYPT.DLL|CRYPT32.DLL|SHLWAPI.DLL)
      return 0
      ;;
    UCRTBASE.DLL|SECHOST.DLL|RPCRT4.DLL|COMBASE.DLL|CFGMGR32.DLL)
      return 0
      ;;
    AVRT.DLL|DWMAPI.DLL|WIN32U.DLL|OPENGL32.DLL|GLU32.DLL|SHCORE.DLL)
      return 0
      ;;
    MSVCP_WIN.DLL|UXTHEME.DLL|BCRYPTPRIMITIVES.DLL|AVICAP32.DLL|MSVFW32.DLL)
      return 0
      ;;
    COMCTL32.DLL|NCRYPT.DLL|WSOCK32.DLL)
      return 0
      ;;
  esac

  return 1
}

is_system_path() {
  local p
  p="$(upper "$1")"
  case "$p" in
    /C/WINDOWS/*|C:/WINDOWS/*|C:\\WINDOWS\\*)
      return 0
      ;;
  esac
  return 1
}

resolve_dep() {
  local owner="$1"
  local dep="$2"
  local owner_dir candidate path_dir
  owner_dir="$(cd "$(dirname "$owner")" && pwd)"

  if [[ "$dep" == [A-Za-z]:/* ]] && [ -e "$dep" ]; then
    echo "$dep"
    return 0
  fi

  candidate="${owner_dir}/${dep}"
  if [ -e "$candidate" ]; then
    echo "$candidate"
    return 0
  fi

  for path_dir in "$BIN_DIR" "$BUILD_DIR" "$FFMPEG_PREFIX/bin" "$MINGW_PREFIX/bin"; do
    [ -n "$path_dir" ] || continue
    candidate="${path_dir}/${dep}"
    if [ -e "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done

  OLD_IFS="$IFS"
  IFS=':'
  for path_dir in $PATH; do
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
  local canonical dep resolved dep_name target

  [ -e "$owner" ] || return 0
  canonical="$(cd "$(dirname "$owner")" && pwd)/$(basename "$owner")"
  if already_visited "$canonical"; then
    return 0
  fi
  mark_visited "$canonical"

  while IFS= read -r dep; do
    [ -n "$dep" ] || continue

    if is_system_dep "$dep"; then
      continue
    fi

    if ! resolved="$(resolve_dep "$owner" "$dep")"; then
      echo "Unresolved non-system dependency: $dep (owner: $owner)" >&2
      return 1
    fi

    if is_system_path "$resolved"; then
      continue
    fi

    dep_name="$(basename "$resolved")"
    target="${BIN_DIR}/${dep_name}"
    if [ ! -e "$target" ]; then
      cp -vL "$resolved" "$target"
      chmod u+w "$target" || true
    fi

    scan_and_copy_deps "$target"
  done < <(objdump -p "$owner" | awk '/DLL Name:/ {print $3}')
}

verify_deps_resolved() {
  local file dep dep_name

  for file in "$BIN_DIR"/*.dll; do
    [ -e "$file" ] || continue

    while IFS= read -r dep; do
      [ -n "$dep" ] || continue
      if is_system_dep "$dep"; then
        continue
      fi

      dep_name="$(basename "$dep")"
      if [ -e "$BIN_DIR/$dep_name" ]; then
        continue
      fi

      if resolved="$(resolve_dep "$file" "$dep" 2>/dev/null)" && is_system_path "$resolved"; then
        continue
      fi

      echo "Packaged dependency missing: $dep (owner: $file)" >&2
      return 1
    done < <(objdump -p "$file" | awk '/DLL Name:/ {print $3}')
  done
}

copy_root_mpv_dlls() {
  local found=0
  local src
  shopt -s nullglob
  for src in "$BUILD_DIR"/libmpv*.dll; do
    if [ -f "$src" ] || [ -L "$src" ]; then
      cp -vP "$src" "$BIN_DIR/"
      found=1
    fi
  done
  if [ "$found" -eq 0 ]; then
    echo "No libmpv*.dll found in $BUILD_DIR" >&2
    exit 1
  fi
}

copy_root_mpv_link_libs() {
  local found=0
  local src name
  shopt -s nullglob
  for src in \
    "$BUILD_DIR"/libmpv*.dll.a \
    "$BUILD_DIR"/libmpv*.a \
    "$BUILD_DIR"/libmpv*.lib \
    "$BUILD_DIR"/mpv*.lib; do
    if [ -f "$src" ] || [ -L "$src" ]; then
      name="$(basename "$src")"
      if [ -e "$LIB_DIR/$name" ]; then
        continue
      fi
      cp -vP "$src" "$LIB_DIR/"
      found=1
    fi
  done
  if [ "$found" -eq 0 ]; then
    echo "Warning: no libmpv link libraries (.lib/.a/.dll.a) found in $BUILD_DIR" >&2
  fi
}

echo "Preparing mingw64 runtime bundle from: $BUILD_DIR"
copy_root_mpv_dlls
TARGET_ARCH="$(infer_windows_target_arch)"
for file in "$BIN_DIR"/libmpv*.dll; do
  [ -e "$file" ] || continue
  verify_windows_dll_arch "$file" "$TARGET_ARCH"
done
copy_root_mpv_link_libs

# Airwave: vanilla libmpv only — no soia_utils / config.data (this is not a soia build).
for file in "$BIN_DIR"/libmpv*.dll; do
  [ -e "$file" ] || continue
  scan_and_copy_deps "$file"
done

if [ -n "${CI:-}" ]; then
  verify_deps_resolved

  tar -czf "${PKG_NAME}.tar.gz" -C "$OUT_DIR" .
  sha256sum "${PKG_NAME}.tar.gz" > "${PKG_NAME}.tar.gz.sha256"

  echo "Created package: ${PKG_NAME}.tar.gz"
  echo "Created checksum: ${PKG_NAME}.tar.gz.sha256"
fi
