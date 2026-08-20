#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MESON_VER="${MESON_VER:-1.8.5}"
MESON_DIR="$PROJECT_ROOT/vendor/meson-$MESON_VER"
MESON_BIN_DIR="$PROJECT_ROOT/vendor/meson-bin"
MESON_WRAPPER="$MESON_BIN_DIR/meson"
MESON_TARBALL="$PROJECT_ROOT/vendor/meson-$MESON_VER.tar.gz"
MESON_URL="https://github.com/mesonbuild/meson/releases/download/$MESON_VER/meson-$MESON_VER.tar.gz"

for tool in curl tar python3; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "$tool not found in PATH" >&2
        exit 1
    fi
done

if [ ! -f "$MESON_DIR/meson.py" ]; then
    rm -rf "$MESON_DIR"
    mkdir -p "$PROJECT_ROOT/vendor"
    curl --fail --location --retry 3 --retry-delay 2 --output "$MESON_TARBALL" "$MESON_URL"
    tar -zxf "$MESON_TARBALL" -C "$PROJECT_ROOT/vendor"
    rm -f "$MESON_TARBALL"
fi

mkdir -p "$MESON_BIN_DIR"
cat > "$MESON_WRAPPER" <<EOF
#!/usr/bin/env bash
exec python3 "$MESON_DIR/meson.py" "\$@"
EOF
chmod +x "$MESON_WRAPPER"

"$MESON_WRAPPER" --version
echo "Meson wrapper ready: $MESON_WRAPPER"
