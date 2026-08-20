#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VCPKG_ROOT="${VCPKG_ROOT:-$PROJECT_ROOT/vcpkg}"
VCPKG_REPOSITORY="${VCPKG_REPOSITORY:-https://github.com/microsoft/vcpkg.git}"
VCPKG_REF="${VCPKG_REF:-2026.04.27}"
VCPKG_COMMIT="${VCPKG_COMMIT:-}"

if [ -z "$VCPKG_COMMIT" ] && [ "$VCPKG_REF" = "2026.04.27" ]; then
    VCPKG_COMMIT="56bb2411609227288b70117ead2c47585ba07713"
fi

if [ -d "$VCPKG_ROOT/.git" ]; then
    echo "Updating vcpkg at $VCPKG_ROOT to $VCPKG_REF"
    git -C "$VCPKG_ROOT" fetch --depth 1 origin "+refs/tags/$VCPKG_REF:refs/tags/$VCPKG_REF"
    git -C "$VCPKG_ROOT" checkout --detach "$VCPKG_REF"
else
    echo "Cloning vcpkg $VCPKG_REF to $VCPKG_ROOT"
    rm -rf "$VCPKG_ROOT"
    git clone --depth 1 --branch "$VCPKG_REF" "$VCPKG_REPOSITORY" "$VCPKG_ROOT"
fi

current_commit="$(git -C "$VCPKG_ROOT" rev-parse HEAD)"
if [ -n "$VCPKG_COMMIT" ] && [ "$current_commit" != "$VCPKG_COMMIT" ]; then
    echo "vcpkg commit mismatch for $VCPKG_REF" >&2
    echo "Expected: $VCPKG_COMMIT" >&2
    echo "Actual:   $current_commit" >&2
    exit 1
fi

"$VCPKG_ROOT/bootstrap-vcpkg.sh" -disableMetrics

echo "Using vcpkg ref=$VCPKG_REF"
echo "$current_commit"
