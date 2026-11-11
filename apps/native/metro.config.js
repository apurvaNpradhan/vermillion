const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const { wrapWithReanimatedMetroConfig } = require("react-native-reanimated/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(wrapWithReanimatedMetroConfig(config), {
  extraThemes: [
    "chalk-light",
    "chalk-dark",
    "frost-light",
    "frost-dark",
    "iron-light",
    "iron-dark",
    "dusk-light",
    "dusk-dark",
  ],
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
});
