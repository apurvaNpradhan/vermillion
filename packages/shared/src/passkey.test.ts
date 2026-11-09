import { describe, expect, it } from "vitest";

import {
  androidApkKeyHashOrigin,
  buildAppleSiteAssociation,
  buildAssetLinks,
  parseCsv,
} from "./passkey";

const FINGERPRINT = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0"))
  .join(":")
  .toUpperCase();

describe("passkey helpers", () => {
  it("derives the android origin as base64url of the digest bytes", () => {
    const expected = Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString("base64url");
    expect(androidApkKeyHashOrigin(FINGERPRINT)).toBe(`android:apk-key-hash:${expected}`);
    expect(androidApkKeyHashOrigin(FINGERPRINT.toLowerCase())).toBe(
      androidApkKeyHashOrigin(FINGERPRINT),
    );
  });

  it("rejects a malformed fingerprint", () => {
    expect(() => androidApkKeyHashOrigin("AA:BB")).toThrow();
  });

  it("builds asset links only when a fingerprint exists", () => {
    expect(buildAssetLinks({ packageName: "com.example.app", fingerprints: [] })).toBeNull();
    expect(
      buildAssetLinks({ packageName: "com.example.app", fingerprints: [FINGERPRINT] }),
    ).toEqual([
      {
        relation: [
          "delegate_permission/common.get_login_creds",
          "delegate_permission/common.handle_all_urls",
        ],
        target: {
          namespace: "android_app",
          package_name: "com.example.app",
          sha256_cert_fingerprints: [FINGERPRINT],
        },
      },
    ]);
  });

  it("builds the apple association only with a team id", () => {
    expect(
      buildAppleSiteAssociation({ teamId: undefined, bundleId: "com.example.app" }),
    ).toBeNull();
    expect(
      buildAppleSiteAssociation({ teamId: "ABCDE12345", bundleId: "com.example.app" }),
    ).toEqual({
      webcredentials: { apps: ["ABCDE12345.com.example.app"] },
    });
  });

  it("parses comma lists", () => {
    expect(parseCsv(" a, b ,,c")).toEqual(["a", "b", "c"]);
    expect(parseCsv(undefined)).toEqual([]);
  });
});
