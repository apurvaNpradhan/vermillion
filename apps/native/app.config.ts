import type { ExpoConfig } from "expo/config";

import { appConfig } from "../../app.config.ts";

/**
 * Bump when the native stack changes (a native module is added, removed or upgraded, or its build
 * flags change), so OTA JavaScript never reaches a binary without the matching native code.
 * `runtimeVersion: appVersion` alone does not change when a native module is added (ADR 0022).
 * 1: op-sqlite 18.2.5 with SQLCipher, expo-crypto, expo-file-system, vermillion-backup module.
 * 2: expo-blur and expo-haptics for the tab bar, page header and haptic tokens.
 * 3: @sbaiahmed1/react-native-blur for the page footer's progressive blur.
 * 4: react-native-passkey 3.6.2 (Credential Manager on Android, associated domains on iOS).
 * 5: @sbaiahmed1/react-native-blur removed (its Android view crashed the release build).
 * 6: expo-image for the exercise library thumbnails.
 * 7: expo-video for the exercise detail video hero.
 * 8: expo-image-picker and expo-image-manipulator for Program cover photos.
 * 10: original Android rest notification small icon. Requires a dev-client rebuild.
 * 11: expo-audio and the Rest-end chime registered as a notification sound.
 * 9: expo-notifications (Rest notifications) and expo-keep-awake (screen on during a workout).
 */
// 12: expo-navigation-bar for theme-resolved Android system bar controls.
const NATIVE_STACK_REVISION = 12;

/**
 * The relying-party domain passkeys are bound to: the host of the server URL, which is also the
 * server's default `AUTH_RP_ID` (ADR 0032). A bare IP or `localhost` cannot own a passkey, so iOS
 * then gets no webcredentials association. Android needs no app config: the domain's
 * assetlinks.json names the app.
 */
function passkeyRpId(serverUrl: string | undefined): string | null {
  if (!serverUrl) return null;
  try {
    const { hostname } = new URL(serverUrl);
    const isIp = /^[\d.]+$/.test(hostname) || hostname.includes(":");
    return hostname === "localhost" || isIp ? null : hostname;
  } catch {
    return null;
  }
}
const rpId = passkeyRpId(process.env.EXPO_PUBLIC_SERVER_URL);

const easProjectId = appConfig.easProjectId || process.env.EAS_PROJECT_ID;

const config: ExpoConfig = {
  name: appConfig.displayName,
  slug: appConfig.name,
  version: appConfig.version,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: appConfig.scheme,
  userInterfaceStyle: "automatic",
  // Mobile only: Expo web is off.
  platforms: ["ios", "android"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: appConfig.bundleIds.ios,
    ...(rpId ? { associatedDomains: [`webcredentials:${rpId}`] } : {}),
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
    ["expo-navigation-bar", { enforceContrast: false }],
    "expo-localization",
    "expo-video",
    // Rest notifications: a local notification when rest is over. Android 13+ asks at the first Rest.
    // The chime is the Rest notification's sound (iOS bundle file, Android raw resource).
    [
      "expo-notifications",
      {
        icon: "./assets/images/notification-icon.png",
        sounds: ["./assets/sounds/rest_end.wav"],
      },
    ],
    // The in-app chime follows the silent switch; no microphone use.
    ["expo-audio", { microphonePermission: false }],
    // Program cover photos: the system photo picker. The camera and microphone are never used.
    [
      "expo-image-picker",
      {
        photosPermission: "Allow $(PRODUCT_NAME) to use a photo as a program cover.",
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    // The backup rules plugin replaces the store's own so key and database exclusions stay together.
    ["expo-secure-store", { configureAndroidBackup: false }],
    "./plugins/with-local-database-backup-rules.js",
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
  // to it, and only when the native runtime matches: app version plus the native stack revision.
  runtimeVersion: `${appConfig.version}+native.${NATIVE_STACK_REVISION}`,
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
