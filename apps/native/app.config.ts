import type { ExpoConfig } from "expo/config";

import { appConfig } from "../../app.config.ts";

const easProjectId = appConfig.easProjectId || process.env.EAS_PROJECT_ID;

const config: ExpoConfig = {
  name: appConfig.displayName,
  slug: appConfig.name,
  version: appConfig.version,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: appConfig.scheme,
  userInterfaceStyle: "automatic",
  // The web build of the app is a separate TanStack Start app; Expo web is off.
  platforms: ["ios", "android"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: appConfig.bundleIds.ios,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: appConfig.bundleIds.android,
  },
  plugins: [
    "expo-router",
    "expo-localization",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: { backgroundColor: "#000000" },
      },
    ],
  ],
  // Over-the-air updates: builds on a channel (see eas.json) receive updates published
  // to it, and only when the native runtime (the app version) matches.
  runtimeVersion: { policy: "appVersion" },
  ...(easProjectId
    ? {
        updates: { url: `https://u.expo.dev/${easProjectId}` },
        extra: { eas: { projectId: easProjectId } },
      }
    : {}),
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
