const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withUniwindConfig } = require("uniwind/metro");
const { wrapWithReanimatedMetroConfig } = require("react-native-reanimated/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

module.exports = withUniwindConfig(wrapWithReanimatedMetroConfig(config), {
  extraThemes: ["contrast-light", "contrast-dark"],
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
});
