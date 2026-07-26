#!/usr/bin/env bash
# Local tvOS build for a PHYSICAL Apple TV — bypasses EAS's tvOS credential gaps.
#
# Why this exists: EAS can't register a tvOS device in its ad-hoc profiles and
# can't cleanly submit tvOS to TestFlight (eas-cli #1349 / #2795), so an EAS .ipa
# won't install on a real Apple TV. Building in Xcode signs correctly for the
# paired device in one step. This script does the Expo prebuild with the exact
# env the react-native-tvos fork needs, then hands off to Xcode.
#
# Prereqs on the Mac (one-time):
#   - Xcode + the tvOS platform installed; Command Line Tools; CocoaPods; Watchman
#   - Node 20+, pnpm
#   - Repo cloned, and deps installed from the REPO ROOT with:
#         EAS_BUILD=1 pnpm install
#     (EAS_BUILD=1 skips packages/db's prisma-generate postinstall, which would
#      otherwise fail with no DATABASE_URL — we're only building the RN app.)
#   - The Apple TV paired in Xcode (Window > Devices and Simulators, wireless)
#
# Usage:  bash apps/tv-native/scripts/prebuild-tvos.sh
set -euo pipefail

cd "$(dirname "$0")/.."            # -> apps/tv-native
APP_DIR="$(pwd)"

# The three react-native-tvos build fixes (mirrors eas.json's development-tvos env):
export EXPO_TV=1                                          # config-tv retargets iOS -> tvOS
export RCT_HERMES_V1_ENABLED=1                            # worklets vs the fork's Hermes V1
export REACT_NATIVE_NODE_MODULES_DIR="$APP_DIR/node_modules"  # pnpm/RNGH podspec realpath fix
# (buildReactNativeFromSource:true is already in app.json's expo-build-properties,
#  so the generated Podfile builds RN core from source against Hermes V1 automatically.)

echo "==> Prebuilding the tvOS project (EXPO_TV=1)…"
npx expo prebuild --platform ios --clean

echo
echo "==> Prebuild done. Now, in Xcode:"
echo "      open ios/*.xcworkspace"
echo "    1. Select the app target > Signing & Capabilities > check 'Automatically"
echo "       manage signing' > pick your Team. Xcode registers the paired Apple TV"
echo "       and creates a tvOS development profile that includes it."
echo "    2. Set the run destination (top bar) to your Apple TV."
echo "    3. Run (Cmd-R). The FIRST build compiles React Native from source —"
echo "       slow on an Intel Mac (~30-60 min); later builds are incremental."
echo
echo "    It's a dev client: run 'npx expo start --dev-client' (this Mac or the PC"
echo "    on the same LAN) and select the dev server on the TV to load the JS bundle."
