const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// with-release-signing";

// Signs release builds with the release keystore when the environment provides it
// (VERMILLION_UPLOAD_STORE_FILE, _STORE_PASSWORD, _KEY_ALIAS, _KEY_PASSWORD), as the Android
// release workflow does. Without a store file the release build keeps the debug key, so a local
// `expo run:android --variant release` still works. A store file with a missing password or
// alias stops the build: a half-configured release must not come out debug-signed.
const releaseSigning = `
        release { ${MARKER}
            def uploadStore = System.getenv("VERMILLION_UPLOAD_STORE_FILE")
            if (uploadStore) {
                ["VERMILLION_UPLOAD_STORE_PASSWORD", "VERMILLION_UPLOAD_KEY_ALIAS", "VERMILLION_UPLOAD_KEY_PASSWORD"].each { name ->
                    if (!System.getenv(name)) {
                        throw new GradleException("Release signing: \${name} is not set")
                    }
                }
                storeFile file(uploadStore)
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

/** The build.gradle text with a `release` signing config that the release build type uses. */
function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  const signingBlock = /signingConfigs\s*\{/;
  const releaseType =
    /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!signingBlock.test(gradle) || !releaseType.test(gradle)) {
    throw new Error("with-release-signing: app/build.gradle no longer has the expected shape");
  }
  return gradle
    .replace(signingBlock, (match) => `${match}${releaseSigning}`)
    .replace(releaseType, "$1signingConfig signingConfigs.release");
}

/** Adds a `release` signing config and points the release build type at it. */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    c.modResults.contents = addReleaseSigning(c.modResults.contents);
    return c;
  });
};
module.exports.addReleaseSigning = addReleaseSigning;
