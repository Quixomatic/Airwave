const { withInfoPlist, createRunOncePlugin } = require("@expo/config-plugins");

// Local network access — libmpv's HTTP does its own connections; iOS may prompt for LAN access.
// (The MPVKit Swift Package itself is linked to the pod via `spm_dependency` in ios/MpvPlayer.podspec,
// not here — that's the target where our Swift actually compiles.)
function withMpvPlayer(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSLocalNetworkUsageDescription =
      config.modResults.NSLocalNetworkUsageDescription ||
      "Used to stream video from media servers on your local network.";
    return config;
  });
}

module.exports = createRunOncePlugin(withMpvPlayer, "mpv-player", "0.0.0");
