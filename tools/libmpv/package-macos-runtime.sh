#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${PROJECT_ROOT}/vendor/mpv/buildout"
SOIA_UTILS_DIR="${PROJECT_ROOT}/vendor/soia_utils"
CONFIG_DATA_SRC="${PROJECT_ROOT}/vendor/config.data"
OUT_DIR="${PROJECT_ROOT}/release"
PKG_NAME=""
DEFAULT_PKG_NAME="libmpv-local-macos"
ORIGINAL_ARGC="$#"

usage() {
  cat <<'EOF'
Usage:
  bash ./package-macos-runtime.sh --pkg-name <name> [--build-dir <dir>] [--out-dir <dir>]

Build a self-contained macOS runtime package:
  - libmpv
  - all non-system dylib dependencies (recursive)
  - install names rewritten to @rpath/<lib>
  - @loader_path rpath added
Defaults:
  (no args) --pkg-name libmpv-local-macos
EOF
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

LIB_DIR="$OUT_DIR/lib"
mkdir -p "$LIB_DIR"
rm -f "$LIB_DIR"/*

BREW_PREFIX="$(brew --prefix 2>/dev/null || true)"
BREW_LIB_DIR=""
if [ -n "$BREW_PREFIX" ]; then
  BREW_LIB_DIR="${BREW_PREFIX}/lib"
fi
VCPKG_INSTALLED_DIR="${VCPKG_INSTALLED_DIR:-$PROJECT_ROOT/vcpkg_installed}"
VCPKG_TARGET_TRIPLET="${VCPKG_TARGET_TRIPLET:-}"
FFMPEG_BUILD_NAME="${FFMPEG_BUILD_NAME:-macos-${MPV_TARGET_ARCH:-$(uname -m)}}"
FFMPEG_PREFIX="${FFMPEG_PREFIX:-$PROJECT_ROOT/vendor/ffmpeg-build/$FFMPEG_BUILD_NAME}"
FFMPEG_LIB_DIR=""
if [ -d "$FFMPEG_PREFIX/lib" ]; then
  FFMPEG_LIB_DIR="$FFMPEG_PREFIX/lib"
fi
if [ -z "$VCPKG_TARGET_TRIPLET" ]; then
  case "${MPV_TARGET_ARCH:-$(uname -m)}" in
    arm64)
      [ -d "$VCPKG_INSTALLED_DIR/arm64-osx-mp" ] && VCPKG_TARGET_TRIPLET="arm64-osx-mp" || VCPKG_TARGET_TRIPLET="arm64-osx"
      ;;
    x86_64)
      [ -d "$VCPKG_INSTALLED_DIR/x64-osx-mp" ] && VCPKG_TARGET_TRIPLET="x64-osx-mp" || VCPKG_TARGET_TRIPLET="x64-osx"
      ;;
  esac
fi
VCPKG_LIB_DIR=""
if [ -n "$VCPKG_TARGET_TRIPLET" ] && [ -d "$VCPKG_INSTALLED_DIR/$VCPKG_TARGET_TRIPLET/lib" ]; then
  VCPKG_LIB_DIR="$VCPKG_INSTALLED_DIR/$VCPKG_TARGET_TRIPLET/lib"
fi
TARGET_ARCH="${MPV_TARGET_ARCH:-$(uname -m)}"
case "$TARGET_ARCH" in
  arm64|x86_64) ;;
  *)
    echo "Unsupported target architecture: $TARGET_ARCH" >&2
    exit 1
    ;;
esac

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

is_target_arch_dylib() {
  local file="$1"
  local archs
  archs="$(lipo -archs "$file" 2>/dev/null || true)"
  [ -n "$archs" ] && printf '%s\n' "$archs" | tr ' ' '\n' | grep -Fxq "$TARGET_ARCH"
}

is_system_dep() {
  case "$1" in
    /System/*|/usr/lib/*|/Library/Apple/*) return 0 ;;
    *) return 1 ;;
  esac
}

get_rpaths() {
  otool -l "$1" | awk '
    $1=="cmd" && $2=="LC_RPATH" {in_rpath=1; next}
    in_rpath && $1=="path" {print $2; in_rpath=0}
  '
}

resolve_dep() {
  local owner="$1"
  local dep="$2"
  local owner_dir candidate suffix rpath
  owner_dir="$(cd "$(dirname "$owner")" && pwd)"

  case "$dep" in
    /*)
      [ -e "$dep" ] && { echo "$dep"; return 0; }
      ;;
    @loader_path/*)
      candidate="${owner_dir}/${dep#@loader_path/}"
      [ -e "$candidate" ] && { echo "$candidate"; return 0; }
      ;;
    @executable_path/*)
      candidate="${owner_dir}/${dep#@executable_path/}"
      [ -e "$candidate" ] && { echo "$candidate"; return 0; }
      ;;
    @rpath/*)
      suffix="${dep#@rpath/}"
      while IFS= read -r rpath; do
        [ -n "$rpath" ] || continue
        rpath="${rpath//@loader_path/$owner_dir}"
        rpath="${rpath//@executable_path/$owner_dir}"
        candidate="${rpath}/${suffix}"
        [ -e "$candidate" ] && { echo "$candidate"; return 0; }
      done < <(get_rpaths "$owner")
      ;;
  esac

  for search_dir in "$owner_dir" "$LIB_DIR" "$BUILD_DIR" "$FFMPEG_LIB_DIR" "$VCPKG_LIB_DIR" "$BREW_LIB_DIR" /opt/homebrew/lib /usr/local/lib; do
    [ -n "$search_dir" ] || continue
    candidate="${search_dir}/$(basename "$dep")"
    [ -e "$candidate" ] && { echo "$candidate"; return 0; }
  done

  return 1
}

scan_and_copy_deps() {
  local owner="$1"
  local dep resolved dep_name target canonical

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

    dep_name="$(basename "$resolved")"
    if [[ "$dep_name" =~ ^libvulkan\.1\.[0-9].*\.dylib$ ]]; then
      dep_name="libvulkan.1.dylib"
      if [ -e "$VCPKG_LIB_DIR/$dep_name" ]; then
        resolved="$VCPKG_LIB_DIR/$dep_name"
      fi
    fi
    if [[ "$dep_name" =~ ^libplacebo\.[0-9].*\.dylib$ ]]; then
      dep_name="libplacebo.dylib"
      if [ -e "$VCPKG_LIB_DIR/$dep_name" ]; then
        resolved="$VCPKG_LIB_DIR/$dep_name"
      fi
    fi
    target="${LIB_DIR}/${dep_name}"
    if [ ! -e "$target" ]; then
      cp -vL "$resolved" "$target"
      chmod u+w "$target" || true
    fi

    scan_and_copy_deps "$target"
  done < <(otool -L "$owner" | tail -n +2 | awk '{print $1}')
}

rewrite_install_names() {
  local file dep dep_name

  shopt -s nullglob
  for file in "$LIB_DIR"/*.dylib "$LIB_DIR"/*.so; do
    [ -f "$file" ] || continue
    chmod u+w "$file" || true

    case "$file" in
      *.dylib|*.so)
        install_name_tool -id "@rpath/$(basename "$file")" "$file" || true
        ;;
    esac

    while IFS= read -r dep; do
      [ -n "$dep" ] || continue

      # Normalize Vulkan dependency to SONAME form, so runtime can dlopen
      # a stable name (libvulkan.1.dylib) instead of a full versioned file.
      if [[ "$dep" =~ (^|/)libvulkan\.1\.[0-9].*\.dylib$ ]] && [ -e "$LIB_DIR/libvulkan.1.dylib" ]; then
        install_name_tool -change "$dep" "@rpath/libvulkan.1.dylib" "$file" || true
        continue
      fi
      if [[ "$dep" =~ (^|/)libplacebo\.[0-9].*\.dylib$ ]] && [ -e "$LIB_DIR/libplacebo.dylib" ]; then
        install_name_tool -change "$dep" "@rpath/libplacebo.dylib" "$file" || true
        continue
      fi

      dep_name="$(basename "$dep")"
      if [ -e "$LIB_DIR/$dep_name" ]; then
        install_name_tool -change "$dep" "@rpath/$dep_name" "$file" || true
      fi
    done < <(otool -L "$file" | tail -n +2 | awk '{print $1}')

    if ! (otool -l "$file" | grep -A2 'LC_RPATH' | grep -q '@loader_path'); then
      install_name_tool -add_rpath "@loader_path" "$file" || true
    fi
  done
}

verify_no_absolute_non_system_refs() {
  local file dep dep_name

  shopt -s nullglob
  for file in "$LIB_DIR"/*.dylib "$LIB_DIR"/*.so; do
    [ -f "$file" ] || continue
    while IFS= read -r dep; do
      [ -n "$dep" ] || continue
      if is_system_dep "$dep"; then
        continue
      fi
      case "$dep" in
        @rpath/*|@loader_path/*|@executable_path/*)
          dep_name="$(basename "$dep")"
          if [ ! -e "$LIB_DIR/$dep_name" ]; then
            echo "Packaged dependency missing: $dep (owner: $file)" >&2
            return 1
          fi
          ;;
        /*)
          echo "Absolute non-system dependency remains: $dep (owner: $file)" >&2
          return 1
          ;;
      esac
    done < <(otool -L "$file" | tail -n +2 | awk '{print $1}')
  done
}

copy_root_mpv_libs() {
  local found=0
  local src
  shopt -s nullglob
  for src in "$BUILD_DIR"/libmpv*.dylib; do
    if [ -f "$src" ] || [ -L "$src" ]; then
      cp -vP "$src" "$LIB_DIR/"
      found=1
    fi
  done
  if [ "$found" -eq 0 ]; then
    echo "No libmpv*.dylib found in $BUILD_DIR" >&2
    exit 1
  fi
}

copy_soia_utils_lib() {
  local triple src
  case "$TARGET_ARCH" in
    arm64)
      triple="aarch64-apple-darwin"
      ;;
    x86_64)
      triple="x86_64-apple-darwin"
      ;;
  esac

  src="${SOIA_UTILS_DIR}/${triple}/libsoia_utils.dylib"
  if [ ! -f "$src" ]; then
    echo "soia_utils dylib not found for ${triple}: $src" >&2
    exit 1
  fi
  if ! is_target_arch_dylib "$src"; then
    echo "soia_utils dylib arch mismatch for target ${TARGET_ARCH}: $src" >&2
    exit 1
  fi

  cp -vP "$src" "$LIB_DIR/"
}

copy_moltenvk_runtime() {
  local moltenvk_lib_src moltenvk_icd_src moltenvk_icd_target owner candidate lib_parent
  local -a lib_candidates icd_candidates

  moltenvk_lib_src=""

  lib_candidates=(
    "${MOLTENVK_LIB_PATH:-}"
    "$PROJECT_ROOT/vendor/MoltenVK/Build/Release/libMoltenVK.dylib"
    "$PROJECT_ROOT/vendor/MoltenVK/Package/Release/MoltenVK/dynamic/dylib/macOS/libMoltenVK.dylib"
    "${BREW_PREFIX}/opt/molten-vk/lib/libMoltenVK.dylib"
    "/opt/homebrew/opt/molten-vk/lib/libMoltenVK.dylib"
    "/usr/local/opt/molten-vk/lib/libMoltenVK.dylib"
  )
  if [ -z "$moltenvk_lib_src" ]; then
    for candidate in "${lib_candidates[@]}"; do
      [ -n "$candidate" ] || continue
      if [ -f "$candidate" ] || [ -L "$candidate" ]; then
        if ! is_target_arch_dylib "$candidate"; then
          continue
        fi
        moltenvk_lib_src="$candidate"
        break
      fi
    done
  fi

  # Fallback: resolve from already-copied binaries when local build output is absent.
  if [ -z "$moltenvk_lib_src" ]; then
    for owner in "$LIB_DIR"/libmpv*.dylib; do
      [ -e "$owner" ] || continue
      if moltenvk_lib_src="$(resolve_dep "$owner" "libMoltenVK.dylib" 2>/dev/null || true)"; then
        [ -n "$moltenvk_lib_src" ] && break
      fi
    done
  fi

  if [ -z "$moltenvk_lib_src" ] && [ -n "$BREW_PREFIX" ] && [ -d "${BREW_PREFIX}/Cellar/molten-vk" ]; then
    while IFS= read -r candidate; do
      [ -n "$candidate" ] || continue
      if is_target_arch_dylib "$candidate"; then
        moltenvk_lib_src="$candidate"
        break
      fi
    done < <(find "${BREW_PREFIX}/Cellar/molten-vk" -type f -name 'libMoltenVK.dylib' -print 2>/dev/null || true)
  fi

  if [ -n "$moltenvk_lib_src" ]; then
    cp -vL "$moltenvk_lib_src" "$LIB_DIR/"
  else
    echo "Warning: libMoltenVK.dylib not found for target arch ${TARGET_ARCH} in known runtime paths" >&2
  fi

  moltenvk_icd_src=""
  if [ -n "${MOLTENVK_ICD_PATH:-}" ] && [ -f "${MOLTENVK_ICD_PATH}" ]; then
    moltenvk_icd_src="${MOLTENVK_ICD_PATH}"
  fi

  if [ -z "$moltenvk_icd_src" ] && [ -n "$moltenvk_lib_src" ]; then
    lib_parent="$(cd "$(dirname "$moltenvk_lib_src")/.." && pwd)"
    icd_candidates=(
      "$lib_parent/etc/vulkan/icd.d/MoltenVK_icd.json"
      "$lib_parent/share/vulkan/icd.d/MoltenVK_icd.json"
    )
    for candidate in "${icd_candidates[@]}"; do
      if [ -f "$candidate" ]; then
        moltenvk_icd_src="$candidate"
        break
      fi
    done
  fi

  if [ -z "$moltenvk_icd_src" ]; then
    icd_candidates=(
      "$PROJECT_ROOT/vendor/MoltenVK/Package/Release/MoltenVK/dynamic/dylib/macOS/MoltenVK_icd.json"
      "$PROJECT_ROOT/vendor/MoltenVK/Build/Release/MoltenVK_icd.json"
      "${BREW_PREFIX}/opt/molten-vk/etc/vulkan/icd.d/MoltenVK_icd.json"
      "${BREW_PREFIX}/opt/molten-vk/share/vulkan/icd.d/MoltenVK_icd.json"
      "/opt/homebrew/opt/molten-vk/etc/vulkan/icd.d/MoltenVK_icd.json"
      "/usr/local/opt/molten-vk/etc/vulkan/icd.d/MoltenVK_icd.json"
    )
    for candidate in "${icd_candidates[@]}"; do
      [ -n "$candidate" ] || continue
      if [ -f "$candidate" ]; then
        moltenvk_icd_src="$candidate"
        break
      fi
    done
  fi

  if [ -z "$moltenvk_icd_src" ] && [ -n "$BREW_PREFIX" ] && [ -d "${BREW_PREFIX}/Cellar/molten-vk" ]; then
    moltenvk_icd_src="$(find "${BREW_PREFIX}/Cellar/molten-vk" -type f -name 'MoltenVK_icd.json' -print -quit 2>/dev/null || true)"
  fi

  if [ -n "$moltenvk_icd_src" ]; then
    moltenvk_icd_target="${LIB_DIR}/MoltenVK_icd.json"
    cp -vL "$moltenvk_icd_src" "$moltenvk_icd_target"
    # Keep ICD portable in runtime packages by removing machine-local library paths.
    sed -i.bak -E 's#"library_path"[[:space:]]*:[[:space:]]*"[^"]*"#"library_path": "libMoltenVK.dylib"#' "$moltenvk_icd_target" || true
    rm -f "${moltenvk_icd_target}.bak"
  else
    echo "Warning: MoltenVK_icd.json not found in known runtime paths" >&2
  fi
}

copy_config_data() {
  if [ ! -f "$CONFIG_DATA_SRC" ]; then
    echo "Required config file not found: $CONFIG_DATA_SRC" >&2
    exit 1
  fi

  mkdir -p "$LIB_DIR"
  cp -vP "$CONFIG_DATA_SRC" "${LIB_DIR}/config.data"
}

echo "Preparing runtime bundle from: $BUILD_DIR"
copy_root_mpv_libs
copy_moltenvk_runtime

# Airwave: vanilla libmpv only — no soia_utils / config.data.
for file in "$LIB_DIR"/libmpv*.dylib; do
  [ -e "$file" ] || continue
  scan_and_copy_deps "$file"
done

rewrite_install_names
verify_no_absolute_non_system_refs

tar -czf "${PKG_NAME}.tar.gz" -C "$OUT_DIR" .
shasum -a 256 "${PKG_NAME}.tar.gz" > "${PKG_NAME}.tar.gz.sha256"

echo "Created package: ${PKG_NAME}.tar.gz"
echo "Created checksum: ${PKG_NAME}.tar.gz.sha256"
