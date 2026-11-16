import { createRequire } from "node:module";

import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  addReleaseSigning,
}: { addReleaseSigning: (gradle: string) => string } = require("./with-release-signing.js");

// The part of the Expo SDK 58 template's app/build.gradle the plugin edits.
const template = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}`;

it("points only the release build type at the release signing config", () => {
  const gradle = addReleaseSigning(template);
  expect(gradle).toContain('System.getenv("VERMILLION_UPLOAD_STORE_FILE")');
  const buildTypes = gradle.slice(gradle.indexOf("buildTypes {"));
  expect(buildTypes.match(/signingConfig signingConfigs\.debug/g)).toHaveLength(1);
  expect(buildTypes.match(/signingConfig signingConfigs\.release/g)).toHaveLength(1);
  expect(buildTypes.indexOf("signingConfigs.debug")).toBeLessThan(
    buildTypes.indexOf("signingConfigs.release"),
  );
});

it("is idempotent and refuses a build.gradle it does not recognise", () => {
  const once = addReleaseSigning(template);
  expect(addReleaseSigning(once)).toBe(once);
  expect(() => addReleaseSigning("android {}")).toThrow("expected shape");
});
