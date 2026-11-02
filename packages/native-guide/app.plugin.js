const { withMainApplication, createRunOncePlugin } = require("@expo/config-plugins");

// ---------------------------------------------------------------------------
// Android: give the image pipeline (Fresco) a bounded network client and a working memory-trim registry.
//
// React Native's default Fresco config builds on a client whose connect/read timeouts are 0 (infinite) and whose
// Dispatcher allows 5 calls per host, so one stalled TCP connection can pin a slot for as long as the kernel keeps it
// and every image on the screen stops loading. It also wires a MemoryTrimmableRegistry that does nothing, so Fresco's
// caches never shrink under memory pressure. This replaces both: the client is `ImageNet.client(...)` (ImageNet.kt in
// this package: bounded timeouts, deadlines that FAIL a call rather than cancel it, a wider Dispatcher), and the
// registry is fed from `Application.onTrimMemory`.
//
// The config is handed to React Native's own FrescoModule through `PackageList(this, MainPackageConfig(config))`, so
// Fresco is initialised exactly once. Calling Fresco.initialize() from onCreate() instead does not work: the module
// initialises Fresco again with its default config and the one set earlier is silently dropped.
//
// What stays as React Native has it: the OkHttp network fetcher, DownsampleMode.AUTO, binary-XML decoding, and cookie
// forwarding (image requests send and store the cookies the WebView CookieManager holds, as `fetch()` does, so an image
// server behind a cookie-setting proxy keeps working). Not carried over: the fetcher's per-source `headers`/`cache`
// options and the systrace listener (no image here uses them).
// ---------------------------------------------------------------------------

const MARKER = "airwave: image pipeline";

const IMPORTS = [
  "import android.content.ComponentCallbacks2",
  "import com.facebook.common.memory.MemoryTrimType",
  "import com.facebook.common.memory.MemoryTrimmable",
  "import com.facebook.common.memory.MemoryTrimmableRegistry",
  "import com.facebook.imagepipeline.backends.okhttp3.OkHttpImagePipelineConfigFactory",
  "import com.facebook.imagepipeline.core.DownsampleMode",
  "import com.facebook.imagepipeline.core.ImagePipelineConfig",
  "import com.facebook.react.modules.network.CookieJarContainer",
  "import com.facebook.react.modules.network.ForwardingCookieHandler",
  "import com.facebook.react.modules.network.OkHttpClientProvider",
  "import com.facebook.react.shell.MainPackageConfig",
  "import expo.modules.nativeguide.ImageNet",
  "import java.util.concurrent.CopyOnWriteArrayList",
  "import okhttp3.JavaNetCookieJar",
];

const MEMBERS = `  // ${MARKER} (see @airwave/native-guide app.plugin.js)
  private val imageTrimmables = CopyOnWriteArrayList<MemoryTrimmable>()

  private fun imagePipelineConfig(): ImagePipelineConfig {
    // React Native's FrescoModule.getDefaultConfigBuilder() needs a ReactContext, which does not exist yet in
    // Application.onCreate(), so the builder is assembled here.
    val client = ImageNet.client(OkHttpClientProvider.createClientBuilder())
    // Forward cookies like FrescoModule does. The builder's cookie jar is an empty container until one is set, so without
    // this image requests would stop sending and storing the cookies that fetch() does.
    (client.cookieJar as? CookieJarContainer)?.setCookieJar(JavaNetCookieJar(ForwardingCookieHandler()))
    val builder =
      OkHttpImagePipelineConfigFactory.newBuilder(this, client)
        .setDownsampleMode(DownsampleMode.AUTO)
        .setMemoryTrimmableRegistry(
          object : MemoryTrimmableRegistry {
            override fun registerMemoryTrimmable(trimmable: MemoryTrimmable) {
              imageTrimmables.add(trimmable)
            }

            override fun unregisterMemoryTrimmable(trimmable: MemoryTrimmable) {
              imageTrimmables.remove(trimmable)
            }
          },
        )
    builder.experiment().setBinaryXmlEnabled(true)
    return builder.build()
  }

  @Suppress("DEPRECATION")
  override fun onTrimMemory(level: Int) {
    super.onTrimMemory(level)
    val type =
      when {
        level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND -> MemoryTrimType.OnAppBackgrounded
        level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL -> MemoryTrimType.OnSystemMemoryCriticallyLowWhileAppInForeground
        level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> MemoryTrimType.OnSystemLowMemoryWhileAppInForeground
        else -> return
      }
    imageTrimmables.forEach { it.trim(type) }
  }

`;

const PACKAGE_LINE = /^package .+$/m;
const PACKAGES_CALL = "PackageList(this).packages";
const ON_CREATE = /^[ \t]*override fun onCreate\(\) \{/m;

/**
 * Pure MainApplication.kt transform: installs the image pipeline config. Idempotent, and throws (naming the missing
 * piece) if Expo's template no longer has an anchor the edit depends on, so a template change fails the prebuild
 * instead of silently shipping React Native's defaults. Exported so it can be tested without a prebuild.
 */
function applyImagePipeline(src) {
  if (src.includes(MARKER)) return src;
  const missing = (what) => {
    throw new Error(`[@airwave/native-guide] Could not find ${what} in MainApplication.kt to install the image pipeline config.`);
  };
  if (!PACKAGE_LINE.test(src)) missing("the package line");
  if (!src.includes(PACKAGES_CALL)) missing(PACKAGES_CALL);
  if (!ON_CREATE.test(src)) missing("Application.onCreate()");
  if (/override fun onTrimMemory\(/.test(src)) {
    throw new Error("[@airwave/native-guide] MainApplication.kt already overrides onTrimMemory(); the image pipeline config would clash with it.");
  }

  const imports = IMPORTS.filter((line) => !src.includes(`\n${line}\n`));
  return src
    .replace(PACKAGE_LINE, (line) => `${line}\n\n${imports.join("\n")}`)
    .replace(PACKAGES_CALL, "PackageList(this, MainPackageConfig(imagePipelineConfig())).packages")
    .replace(ON_CREATE, (line) => `${MEMBERS}${line}`);
}

function withImagePipeline(config) {
  return withMainApplication(config, (config) => {
    if (config.modResults.language !== "kt") {
      console.warn("[@airwave/native-guide] MainApplication is not Kotlin; leaving the image pipeline at React Native's defaults.");
      return config;
    }
    config.modResults.contents = applyImagePipeline(config.modResults.contents);
    return config;
  });
}

module.exports = createRunOncePlugin(withImagePipeline, "native-guide", "0.0.0");
module.exports.applyImagePipeline = applyImagePipeline;
