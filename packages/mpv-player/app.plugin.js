const { withXcodeProject, withInfoPlist, createRunOncePlugin } = require("@expo/config-plugins");

// The MPVKit Swift Package (github.com/edde746/MPVKit) — the fork with the iOS/tvOS `avfoundation` VO
// + HDR/Dolby-Vision conversion that plezy proves in production. Pin latest here.
const MPVKIT_REPO = "https://github.com/edde746/MPVKit";
const MPVKIT_PRODUCT = "MPVKit";
const MPVKIT_MIN_VERSION = "1.0.12";

/**
 * Add the MPVKit SPM package to the app's Xcode project and link its product into the app target.
 * MPVKit is SPM-only (no podspec), so — like plezy's `wire_mpv.rb` — it must be wired into the
 * generated project directly. Runs during `expo prebuild` / EAS Build.
 */
function withMpvkitSwiftPackage(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const objects = project.hash.project.objects;

    // Idempotency: skip if MPVKit is already referenced.
    const existingRefs = objects["XCRemoteSwiftPackageReference"] || {};
    for (const key of Object.keys(existingRefs)) {
      if (typeof existingRefs[key] === "object" && String(existingRefs[key].repositoryURL || "").includes("MPVKit")) {
        return config;
      }
    }

    const pkgRefUuid = project.generateUuid();
    const prodDepUuid = project.generateUuid();

    // 1) XCRemoteSwiftPackageReference — the package source + version rule.
    objects["XCRemoteSwiftPackageReference"] = objects["XCRemoteSwiftPackageReference"] || {};
    objects["XCRemoteSwiftPackageReference"][pkgRefUuid] = {
      isa: "XCRemoteSwiftPackageReference",
      repositoryURL: `"${MPVKIT_REPO}"`,
      requirement: { kind: "upToNextMajorVersion", minimumVersion: MPVKIT_MIN_VERSION },
    };
    objects["XCRemoteSwiftPackageReference"][`${pkgRefUuid}_comment`] = `XCRemoteSwiftPackageReference "${MPVKIT_PRODUCT}"`;

    // 2) XCSwiftPackageProductDependency — the specific product to link.
    objects["XCSwiftPackageProductDependency"] = objects["XCSwiftPackageProductDependency"] || {};
    objects["XCSwiftPackageProductDependency"][prodDepUuid] = {
      isa: "XCSwiftPackageProductDependency",
      package: pkgRefUuid,
      package_comment: `XCRemoteSwiftPackageReference "${MPVKIT_PRODUCT}"`,
      productName: MPVKIT_PRODUCT,
    };
    objects["XCSwiftPackageProductDependency"][`${prodDepUuid}_comment`] = MPVKIT_PRODUCT;

    // 3) Register the package reference on the PBXProject.
    const projectSection = objects["PBXProject"];
    const projectUuid = Object.keys(projectSection).find((k) => !k.endsWith("_comment"));
    const pbxProject = projectSection[projectUuid];
    pbxProject.packageReferences = pbxProject.packageReferences || [];
    pbxProject.packageReferences.push({ value: pkgRefUuid, comment: `XCRemoteSwiftPackageReference "${MPVKIT_PRODUCT}"` });

    // 4) Link the product into every application target (the app + its tvOS twin if present).
    const nativeTargets = objects["PBXNativeTarget"] || {};
    for (const key of Object.keys(nativeTargets)) {
      if (key.endsWith("_comment")) continue;
      const target = nativeTargets[key];
      if (target.productType !== '"com.apple.product-type.application"') continue;
      target.packageProductDependencies = target.packageProductDependencies || [];
      target.packageProductDependencies.push({ value: prodDepUuid, comment: MPVKIT_PRODUCT });
    }

    return config;
  });
}

// Local network access — libmpv's HTTP does its own connections; iOS may prompt for LAN access.
function withLocalNetwork(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSLocalNetworkUsageDescription =
      config.modResults.NSLocalNetworkUsageDescription ||
      "Used to stream video from media servers on your local network.";
    return config;
  });
}

const withMpvPlayer = (config) => withLocalNetwork(withMpvkitSwiftPackage(config));

module.exports = createRunOncePlugin(withMpvPlayer, "mpv-player", "0.0.0");
