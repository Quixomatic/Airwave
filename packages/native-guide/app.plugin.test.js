import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { applyImagePipeline } = require("./app.plugin.js");

// MainApplication.kt as Expo SDK 55 generates it (a fresh `expo prebuild` of apps/tv-native): the file the transform edits.
const STOCK = `package com.airwave.tv

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
`;

const count = (haystack, needle) => haystack.split(needle).length - 1;

describe("applyImagePipeline (Fresco config in MainApplication.kt)", () => {
  const out = applyImagePipeline(STOCK);

  test("hands Fresco the bounded image client through React Native's own package config", () => {
    expect(out).toContain("PackageList(this, MainPackageConfig(imagePipelineConfig())).packages");
    expect(out).not.toContain("PackageList(this).packages");
    expect(out).toContain("val client = ImageNet.client(OkHttpClientProvider.createClientBuilder())");
    expect(out).toContain("OkHttpImagePipelineConfigFactory.newBuilder(this, client)");
    expect(out).toContain("import expo.modules.nativeguide.ImageNet\n");
  });

  test("forwards cookies on image requests, as React Native's own Fresco config does", () => {
    // The builder's jar is an empty container until one is set; FrescoModule sets a forwarding jar on its own client.
    expect(out).toContain("(client.cookieJar as? CookieJarContainer)?.setCookieJar(JavaNetCookieJar(ForwardingCookieHandler()))");
    // The jar is set on the client Fresco is built with.
    expect(out.indexOf("setCookieJar(")).toBeLessThan(out.indexOf("newBuilder(this, client)"));
    for (const imported of [
      "com.facebook.react.modules.network.CookieJarContainer",
      "com.facebook.react.modules.network.ForwardingCookieHandler",
      "okhttp3.JavaNetCookieJar",
    ]) {
      expect(out).toContain(`import ${imported}\n`);
    }
  });

  test("initialises Fresco exactly once: the plugin never calls Fresco.initialize itself", () => {
    expect(out).not.toContain("Fresco.initialize");
    expect(count(out, "imagePipelineConfig()")).toBe(2); // the one definition and the one use
    expect(count(out, "PackageList(")).toBe(1);
  });

  test("wires a real memory trim registry to onTrimMemory", () => {
    expect(out).toContain("object : MemoryTrimmableRegistry");
    expect(out).toContain("override fun onTrimMemory(level: Int)");
    expect(out).toContain("MemoryTrimType.OnAppBackgrounded");
    expect(out).toContain("MemoryTrimType.OnSystemMemoryCriticallyLowWhileAppInForeground");
    expect(out).toContain("MemoryTrimType.OnSystemLowMemoryWhileAppInForeground");
    expect(out).toContain("imageTrimmables.forEach { it.trim(type) }");
  });

  test("keeps React Native's own image settings that are not part of the change", () => {
    expect(out).toContain(".setDownsampleMode(DownsampleMode.AUTO)");
    expect(out).toContain("builder.experiment().setBinaryXmlEnabled(true)");
    expect(out).not.toContain("setBitmapMemoryCacheParamsSupplier");
  });

  test("puts every import after the package line and before the class, without duplicates", () => {
    const lines = out.split("\n").filter((l) => l.startsWith("import "));
    expect(new Set(lines).size).toBe(lines.length);
    expect(out.indexOf("import expo.modules.nativeguide.ImageNet")).toBeLessThan(out.indexOf("class MainApplication"));
    expect(out.startsWith("package com.airwave.tv\n\nimport ")).toBe(true);
  });

  test("puts the members inside the class, ahead of onCreate, and leaves the rest of the file alone", () => {
    expect(out.indexOf("private val imageTrimmables")).toBeGreaterThan(out.indexOf("class MainApplication"));
    expect(out.indexOf("private val imageTrimmables")).toBeLessThan(out.indexOf("override fun onCreate()"));
    expect(out).toContain("  override fun onCreate() {\n    super.onCreate()\n    DefaultNewArchitectureEntryPoint.releaseLevel");
    expect(out).toContain("override fun onConfigurationChanged(newConfig: Configuration)");
  });

  test("is idempotent", () => {
    expect(applyImagePipeline(out)).toBe(out);
  });

  test("does not add an import the file already has", () => {
    const withImport = STOCK.replace(
      "import android.app.Application\n",
      "import android.app.Application\nimport android.content.ComponentCallbacks2\n",
    );
    const result = applyImagePipeline(withImport);
    expect(count(result, "import android.content.ComponentCallbacks2\n")).toBe(1);
  });

  test("throws, naming the piece, when an anchor is missing", () => {
    expect(() => applyImagePipeline(STOCK.replace("PackageList(this).packages", "PackageList(this).getPackages()"))).toThrow(
      /Could not find PackageList\(this\)\.packages in MainApplication\.kt/,
    );
    expect(() => applyImagePipeline(STOCK.replace("override fun onCreate()", "override fun onStart()"))).toThrow(
      /Could not find Application\.onCreate\(\) in MainApplication\.kt/,
    );
    expect(() => applyImagePipeline(STOCK.replace("package com.airwave.tv\n", ""))).toThrow(/Could not find the package line/);
  });

  test("throws instead of clashing with an existing onTrimMemory override", () => {
    const own = STOCK.replace(
      "  override fun onCreate() {",
      "  override fun onTrimMemory(level: Int) {\n    super.onTrimMemory(level)\n  }\n\n  override fun onCreate() {",
    );
    expect(() => applyImagePipeline(own)).toThrow(/already overrides onTrimMemory/);
  });
});

describe("the Kotlin the plugin refers to", () => {
  const imageNet = readFileSync(
    join(import.meta.dir, "android/src/main/java/expo/modules/nativeguide/ImageNet.kt"),
    "utf8",
  );

  test("ImageNet is the object the generated code imports and calls", () => {
    expect(imageNet).toContain("package expo.modules.nativeguide\n");
    expect(imageNet).toMatch(/^object ImageNet \{/m);
    expect(imageNet).toMatch(/@JvmStatic\s+fun client\(base: OkHttpClient\.Builder\): OkHttpClient/);
  });
});
