const { withStringsXml } = require("expo/config-plugins");

/**
 * Display the Android app as "Airwave".
 *
 * We keep `expo.name` = "ChannelGuide" (stable native project name; the iOS label is handled by
 * `ios.infoPlist.CFBundleDisplayName`). On Android the launcher label resolves to
 * `android:label="@string/app_name"`, and Expo sets `app_name` from `expo.name` — so this plugin
 * overrides that one string to the visible product name, without touching any namespace
 * (`android.package` = com.channelguide.tv stays). Runs after Expo populates strings.xml, so it
 * replaces the existing entry.
 */
const APP_LABEL = "Airwave";

module.exports = function withAndroidAppName(config) {
  return withStringsXml(config, (cfg) => {
    const resources = cfg.modResults.resources;
    resources.string = resources.string ?? [];
    const existing = resources.string.find((s) => s.$ && s.$.name === "app_name");
    if (existing) existing._ = APP_LABEL;
    else resources.string.push({ $: { name: "app_name", translatable: "false" }, _: APP_LABEL });
    return cfg;
  });
};
