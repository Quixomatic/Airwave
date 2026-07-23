// Metro (Expo's bundler), configured for this pnpm + Turborepo monorepo AND for NativeWind.
//
// The monorepo bits are what let Metro resolve packages that pnpm hoists to the repo root rather
// than duplicating under apps/tv-native: we watch the repo root, and let Metro look up node_modules
// from both the app and the root. `disableHierarchicalLookup` stays FALSE so pnpm's nested,
// symlinked layout still resolves.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

module.exports = withNativeWind(config, { input: "./global.css" });
