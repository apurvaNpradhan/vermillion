const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// with-release-signing";

// Signs release builds with the upload keystore when CI provides it through the environment
// (VERMILLION_UPLOAD_STORE_FILE, _STORE_PASSWORD, _KEY_ALIAS, _KEY_PASSWORD). Without them the
// release build keeps the debug key, so a local `expo run:android --variant release` still works.
const releaseSigning = `
        release { ${MARKER}
            if (System.getenv("VERMILLION_UPLOAD_STORE_FILE")) {
                storeFile file(System.getenv("VERMILLION_UPLOAD_STORE_FILE"))
                storePassword System.getenv("VERMILLION_UPLOAD_STORE_PASSWORD")
                keyAlias System.getenv("VERMILLION_UPLOAD_KEY_ALIAS")
                keyPassword System.getenv("VERMILLION_UPLOAD_KEY_PASSWORD")
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }`;

/** Adds a `release` signing config and points the release build type at it. */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    let gradle = c.modResults.contents;
    if (gradle.includes(MARKER)) return c;
    const signingBlock = /signingConfigs\s*\{/;
    const releaseType =
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!signingBlock.test(gradle) || !releaseType.test(gradle)) {
      throw new Error("with-release-signing: app/build.gradle no longer has the expected shape");
    }
    gradle = gradle.replace(signingBlock, (m) => `${m}${releaseSigning}`);
    gradle = gradle.replace(releaseType, "$1signingConfig signingConfigs.release");
    c.modResults.contents = gradle;
    return c;
  });
};
