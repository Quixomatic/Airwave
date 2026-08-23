const {
  withInfoPlist,
  withXcodeProject,
  withAppBuildGradle,
  createRunOncePlugin,
} = require("@expo/config-plugins");

// Expo Android autolinking names a local module's gradle project after its npm package, stripping `@`
// and replacing `/` with `-`, PRESERVING case — so `@airwave/mpv-player` → `:airwave-mpv-player`
// (LOWERCASE scope). Must match exactly or gradle fails with "Project with path ':…' could not be
// found". (The Airwave rename wrongly capitalized this to `:Airwave-mpv-player`, breaking Android builds;
// pre-rename it was `:ChannelGuide-mpv-player`, matching the `@ChannelGuide` scope's case.)
const MPV_GRADLE_PROJECT = ":airwave-mpv-player";

const MPVKIT_URL = "https://github.com/edde746/MPVKit";
const MPVKIT_VERSION = "1.0.12";
const MPVKIT_PRODUCT = "MPVKit";

// ---------------------------------------------------------------------------
// 1. Local-network usage description — libmpv opens its own HTTP connections,
//    so iOS may prompt for LAN access when streaming from a media server.
// ---------------------------------------------------------------------------
function withLocalNetwork(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSLocalNetworkUsageDescription =
      config.modResults.NSLocalNetworkUsageDescription ||
      "Used to stream video from media servers on your local network.";
    return config;
  });
}

// ---------------------------------------------------------------------------
// 2. Link the MPVKit Swift Package on the APP target (plezy's proven model).
//
//    The podspec's `spm_dependency` adds MPVKit to the *Pods* project so our
//    Swift COMPILES (`import Libmpv`). But React Native's static-linking SPM
//    path only pulls MPVKit's direct dependencies — it drops the transitive
//    `Libass` framework (which sits under `_FFmpeg`), so the app link fails with
//    `Undefined symbol: _ass_add_font`. Linking the `MPVKit` product on the APP
//    target too makes Xcode resolve the FULL package graph and pull every
//    transitive xcframework (Libass, FFmpeg, …) into the final binary — exactly
//    how the `.refs/plezy` Flutter client wires it (tvos/scripts/wire_mpv.rb).
//    Both references resolve to the one workspace-level SPM package, and the
//    binary xcframeworks link lazily, so this supplements the missing frameworks
//    without duplicating symbols.
// ---------------------------------------------------------------------------
function withMpvkitAppTargetSPM(config) {
  return withXcodeProject(config, (config) => {
    const proj = config.modResults;
    const objects = proj.hash.project.objects;

    const app = proj.getTarget("com.apple.product-type.application");
    if (!app) {
      throw new Error(
        "[@airwave/mpv-player] Could not find the application target to link MPVKit."
      );
    }
    const nativeTarget = app.target;

    // --- (a) XCRemoteSwiftPackageReference (idempotent by repositoryURL) ---
    objects.XCRemoteSwiftPackageReference =
      objects.XCRemoteSwiftPackageReference || {};
    let pkgRefUuid = Object.keys(objects.XCRemoteSwiftPackageReference).find(
      (key) => {
        const o = objects.XCRemoteSwiftPackageReference[key];
        return (
          o &&
          typeof o === "object" &&
          typeof o.repositoryURL === "string" &&
          o.repositoryURL.includes("edde746/MPVKit")
        );
      }
    );
    if (!pkgRefUuid) {
      pkgRefUuid = proj.generateUuid();
      objects.XCRemoteSwiftPackageReference[pkgRefUuid] = {
        isa: "XCRemoteSwiftPackageReference",
        repositoryURL: `"${MPVKIT_URL}"`,
        requirement: {
          kind: "exactVersion",
          version: `"${MPVKIT_VERSION}"`,
        },
      };
      objects.XCRemoteSwiftPackageReference[`${pkgRefUuid}_comment`] =
        `XCRemoteSwiftPackageReference "MPVKit"`;

      const projObj = proj.getFirstProject().firstProject;
      projObj.packageReferences = projObj.packageReferences || [];
      projObj.packageReferences.push({
        value: pkgRefUuid,
        comment: `XCRemoteSwiftPackageReference "MPVKit"`,
      });
    }

    // --- (b) XCSwiftPackageProductDependency (idempotent by productName) ---
    objects.XCSwiftPackageProductDependency =
      objects.XCSwiftPackageProductDependency || {};
    let prodDepUuid = Object.keys(objects.XCSwiftPackageProductDependency).find(
      (key) => {
        const o = objects.XCSwiftPackageProductDependency[key];
        return o && typeof o === "object" && o.productName === MPVKIT_PRODUCT;
      }
    );
    if (!prodDepUuid) {
      prodDepUuid = proj.generateUuid();
      objects.XCSwiftPackageProductDependency[prodDepUuid] = {
        isa: "XCSwiftPackageProductDependency",
        package: pkgRefUuid,
        package_comment: `XCRemoteSwiftPackageReference "MPVKit"`,
        productName: MPVKIT_PRODUCT,
      };
      objects.XCSwiftPackageProductDependency[`${prodDepUuid}_comment`] =
        MPVKIT_PRODUCT;

      nativeTarget.packageProductDependencies =
        nativeTarget.packageProductDependencies || [];
      nativeTarget.packageProductDependencies.push({
        value: prodDepUuid,
        comment: MPVKIT_PRODUCT,
      });
    }

    // --- (c) PBXBuildFile + Frameworks build-phase entry (the actual LINK) ---
    objects.PBXBuildFile = objects.PBXBuildFile || {};
    const alreadyLinked = Object.keys(objects.PBXBuildFile).some((key) => {
      const o = objects.PBXBuildFile[key];
      return o && typeof o === "object" && o.productRef === prodDepUuid;
    });
    if (!alreadyLinked) {
      const buildFileUuid = proj.generateUuid();
      objects.PBXBuildFile[buildFileUuid] = {
        isa: "PBXBuildFile",
        productRef: prodDepUuid,
        productRef_comment: MPVKIT_PRODUCT,
      };
      objects.PBXBuildFile[`${buildFileUuid}_comment`] =
        `${MPVKIT_PRODUCT} in Frameworks`;

      const frameworksPhase = proj.pbxFrameworksBuildPhaseObj(app.uuid);
      frameworksPhase.files = frameworksPhase.files || [];
      frameworksPhase.files.push({
        value: buildFileUuid,
        comment: `${MPVKIT_PRODUCT} in Frameworks`,
      });
    }

    return config;
  });
}

// ---------------------------------------------------------------------------
// 3. Android — package libmpv's newer `libc++_shared.so` at APP-PROJECT scope.
//
//    libmpv.so is built against a newer libc++ that has `std::from_chars<float>`
//    (`__from_chars_floating_point`). Other native libs (RN / Reanimated) bundle
//    OLDER `libc++_shared.so` copies, and with a plain `pickFirst` merge one of
//    those wins → `dlopen` of libmpv.so fails to locate the symbol at runtime.
//    Setting the jniLibs source inside the mpv MODULE isn't enough — Gradle merges
//    project-scope (the app) jniLibs AHEAD of subprojects/AARs, so the newer libc++
//    must be declared on the APP. The mpv module's `extractMpvLibcxx` task already
//    unzips the AAR's `libc++_shared.so` per-ABI to its build dir; here we point the
//    app's source set at it (+ the merge-task dependency). Mirrors `.refs/plezy`'s
//    app-module setup, adapted to Expo's generated `app/build.gradle`.
// ---------------------------------------------------------------------------
function withMpvAndroidLibcxx(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") return config;
    if (config.modResults.contents.includes("mpv-player: app-scope libc++")) return config;
    config.modResults.contents += `

// mpv-player: app-scope libc++ — see @airwave/mpv-player app.plugin.js. libmpv.so needs the
// newer libc++_shared.so (std::from_chars<float>); declaring it at project scope makes it win the
// jniLibs merge over the older copies RN/Reanimated bundle.
android {
    packagingOptions {
        pickFirst 'lib/*/libc++_shared.so'
    }
    sourceSets {
        main {
            jniLibs.srcDir(project('${MPV_GRADLE_PROJECT}').layout.buildDirectory.dir('libmpv/libcxx/jni').get().asFile)
        }
    }
}
tasks.matching { it.name.startsWith('merge') && it.name.endsWith('JniLibFolders') }.configureEach {
    dependsOn '${MPV_GRADLE_PROJECT}:extractMpvLibcxx'
}
`;
    return config;
  });
}

function withMpvPlayer(config) {
  config = withLocalNetwork(config);
  config = withMpvkitAppTargetSPM(config);
  config = withMpvAndroidLibcxx(config);
  return config;
}

module.exports = createRunOncePlugin(withMpvPlayer, "mpv-player", "0.0.0");
