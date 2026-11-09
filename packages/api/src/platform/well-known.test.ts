import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ApiConfig } from "./config";
import { wellKnownRoutes } from "./well-known";

const assetLinksSchema = z.array(
  z.object({
    relation: z.array(z.string()),
    target: z.object({
      package_name: z.string(),
      sha256_cert_fingerprints: z.array(z.string()),
    }),
  }),
);

const FINGERPRINT = Array.from({ length: 32 }, () => "AB").join(":");

const configured: ApiConfig["appAssociation"] = {
  androidPackage: "com.example.app",
  iosBundleId: "com.example.app",
  androidCertFingerprints: [FINGERPRINT, FINGERPRINT.toLowerCase()],
  appleTeamId: "ABCDE12345",
};

const unconfigured: ApiConfig["appAssociation"] = {
  ...configured,
  androidCertFingerprints: [],
  appleTeamId: undefined,
};

describe("assetlinks.json", () => {
  it("is JSON for the android package with the configured fingerprints", async () => {
    const response = await wellKnownRoutes(configured).request("/assetlinks.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const [statement] = assetLinksSchema.parse(await response.json());
    expect(statement?.relation).toEqual([
      "delegate_permission/common.get_login_creds",
      "delegate_permission/common.handle_all_urls",
    ]);
    expect(statement?.target.package_name).toBe("com.example.app");
    expect(statement?.target.sha256_cert_fingerprints).toEqual([FINGERPRINT, FINGERPRINT]);
  });

  it("is 404 when no fingerprint is configured", async () => {
    const response = await wellKnownRoutes(unconfigured).request("/assetlinks.json");
    expect(response.status).toBe(404);
  });
});

describe("apple-app-site-association", () => {
  it("lists webcredentials for TEAMID.bundleId", async () => {
    const response = await wellKnownRoutes(configured).request("/apple-app-site-association");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      webcredentials: { apps: ["ABCDE12345.com.example.app"] },
    });
  });

  it("is 404 without a team id", async () => {
    const response = await wellKnownRoutes(unconfigured).request("/apple-app-site-association");
    expect(response.status).toBe(404);
  });
});
