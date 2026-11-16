const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const { wrapWithReanimatedMetroConfig } = require("react-native-reanimated/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(wrapWithReanimatedMetroConfig(config), {
  // One variant per accent and mode (packages/ui variantName); mono owns light and dark.
  extraThemes: [
    "black",
    "vermilion-light",
    "vermilion-dark",
    "vermilion-black",
    "cobalt-light",
    "cobalt-dark",
    "cobalt-black",
    "violet-light",
    "violet-dark",
    "violet-black",
    "teal-light",
    "teal-dark",
    "teal-black",
  ],
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
});
