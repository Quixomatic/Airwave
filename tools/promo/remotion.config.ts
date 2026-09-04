import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

// Media (screenshots + demo clips) live in ./assets, referenced via staticFile().
Config.setPublicDir("assets");

Config.overrideWebpackConfig((currentConfiguration) => {
  return enableTailwind(currentConfiguration);
});
