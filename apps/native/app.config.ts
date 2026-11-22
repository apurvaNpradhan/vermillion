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
// 13: local Android workout-live module, promoted ongoing notification permission.
// 14: camera permission for user photos (expo-image-picker's manifest and Info.plist entries).
// 15: photo-library permission copy covers all user image features.
// 16: react-native-view-shot, expo-media-library (add-only) and expo-sharing for Share cards.
// 17: react-native-passkey removed, no associated domains; new bundle id (Cinnabar).
// 18: @react-native-community/netinfo feeds the online state (offline-first).
// 19, 20: the Android home-screen widget module (removed in 25, ADR 0054).
// 21: expo-document-picker (history import from a CSV file).
// 22: renamed to Basalt: new bundle id, scheme and EAS slug.
// 23: @sentry/react-native (crash reporting, in-app feedback) and its Expo config plugin.
// 24: renamed to Patina: new bundle id, scheme and EAS slug again.
// 25: the Android next-workout-widget module is removed (ADR 0054).
// 26: renamed to Sigil: new bundle id and scheme (ADR 0055).
// 27: Sigil brand images (icon, adaptive and notification icons, splash) and the EB Garamond fonts.
// 28: remove the react-native-webview dependency with Turnstile.
const NATIVE_STACK_REVISION = 28;

/**
 * The Sigil brand colours, for the places the native build needs a literal (icon background,
 * splash and notification accent). These are branding assets, independent of in-app appearance
 * (docs/design/sigil/SPEC.md). `pnpm brand:assets` regenerates the images.
 */
const BRAND_GROUND = "#0B0A09";
const BRAND_EMBER = "#E04A2F";
const ADAPTIVE_FOREGROUND = "./assets/images/android-icon-foreground.png";
const ADAPTIVE_MONOCHROME = "./assets/images/android-icon-monochrome.png";

/**
 * Source map upload is on only when the build has a Sentry auth token (the Android release
 * workflow and EAS provide it); every other build skips it instead of failing. Organization and
 * project come from `SENTRY_ORG` / `SENTRY_PROJECT` when set; the plugin falls back to the
 * same variables during the build.
 */
const sentryUpload = Boolean(process.env.SENTRY_AUTH_TOKEN);

const easProjectId = appConfig.easProjectId || process.env.EAS_PROJECT_ID;

/**
 * The Android release workflow passes its run number, so every APK it builds installs over the
 * previous one. Unset (local builds, EAS with its remote version source) keeps the default.
 */
const androidVersionCode = Number(process.env.ANDROID_VERSION_CODE);

const config: ExpoConfig = {
  name: appConfig.displayName,
  slug: appConfig.easSlug,
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
  },
  android: {
    permissions: ["android.permission.POST_PROMOTED_NOTIFICATIONS"],
    adaptiveIcon: {
      // The ground; the foreground is mark A inside the 66dp safe circle.
      backgroundColor: BRAND_GROUND,
      foregroundImage: ADAPTIVE_FOREGROUND,
      // Android tints the mark for themed icons.
      monochromeImage: ADAPTIVE_MONOCHROME,
    },
    predictiveBackGestureEnabled: false,
    package: appConfig.bundleIds.android,
    ...(Number.isInteger(androidVersionCode) && androidVersionCode > 0
      ? { versionCode: androidVersionCode }
      : {}),
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
        // Mark A in white on transparent; Android tints it.
        icon: "./assets/images/notification-icon.png",
        color: BRAND_EMBER,
        sounds: ["./assets/sounds/rest_end.wav"],
      },
    ],
    // The in-app chime follows the silent switch; no microphone use.
    ["expo-audio", { microphonePermission: false }],
    // Photos: the system photo picker for covers and progress photos, and the system camera for
    // progress photos. The microphone is never used.
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow $(PRODUCT_NAME) to access photos for covers, exercise images, progress photos and workout photos.",
        cameraPermission: "Allow $(PRODUCT_NAME) to take photos.",
        microphonePermission: false,
      },
    ],
    // Share cards: Save to Photos only adds images, so only the add permission string is new and
    // Android asks for no read access. The read string repeats the picker's so this plugin never
    // replaces it. Sharing needs no config.
    [
      "expo-media-library",
      {
        photosPermission:
          "Allow $(PRODUCT_NAME) to access photos for covers, exercise images, progress photos and workout photos.",
        savePhotosPermission: "Allow $(PRODUCT_NAME) to save your share cards to your photos.",
        granularPermissions: [],
      },
    ],
    // The backup rules plugin replaces the store's own so key and database exclusions stay together.
    ["expo-secure-store", { configureAndroidBackup: false }],
    "./plugins/with-local-database-backup-rules.js",
    // Release builds sign with the keystore the Android release workflow provides.
    "./plugins/with-release-signing.js",
    // Crash reporting. The SDK itself starts only when EXPO_PUBLIC_SENTRY_DSN is set.
    [
      "@sentry/react-native/expo",
      {
        ...(process.env.SENTRY_ORG ? { organization: process.env.SENTRY_ORG } : {}),
        ...(process.env.SENTRY_PROJECT ? { project: process.env.SENTRY_PROJECT } : {}),
        disableAutoUpload: !sentryUpload,
      },
    ],
    [
      "expo-splash-screen",
      {
        // Mark A2 on the ground in light and dark alike: the brand, not the appearance.
        image: "./assets/images/splash-icon.png",
        imageWidth: 240,
        // The Android splash masks the drawable to a 192dp circle.
        android: { imageWidth: 200 },
        resizeMode: "contain",
        backgroundColor: BRAND_GROUND,
        dark: { image: "./assets/images/splash-icon.png", backgroundColor: BRAND_GROUND },
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
