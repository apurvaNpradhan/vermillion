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
    "indigo-light",
    "indigo-dark",
    "indigo-black",
    "orchid-light",
    "orchid-dark",
    "orchid-black",
    "sky-light",
    "sky-dark",
    "sky-black",
  ],
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
});
