import { describe, expect, it } from "vitest";

import { appConfig } from "../../platform/app-config";

import { appleAssociationResponse, assetLinksResponse } from "./index";

const FINGERPRINT = Array.from({ length: 32 }, () => "AB").join(":");

describe("assetlinks.json", () => {
  it("is JSON for the android package with the configured fingerprints", async () => {
    const response = assetLinksResponse(`${FINGERPRINT}, ${FINGERPRINT.toLowerCase()}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const [statement] = await response.json();
    expect(statement.relation).toEqual([
      "delegate_permission/common.get_login_creds",
      "delegate_permission/common.handle_all_urls",
    ]);
    expect(statement.target.package_name).toBe(appConfig.bundleIds.android);
    expect(statement.target.sha256_cert_fingerprints).toEqual([FINGERPRINT, FINGERPRINT]);
  });

  it("is 404 when no fingerprint is configured", () => {
    expect(assetLinksResponse("").status).toBe(404);
  });
});

describe("apple-app-site-association", () => {
  it("lists webcredentials for TEAMID.bundleId", async () => {
    const response = appleAssociationResponse("ABCDE12345");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      webcredentials: { apps: [`ABCDE12345.${appConfig.bundleIds.ios}`] },
    });
  });

  it("is 404 without a team id", () => {
    expect(appleAssociationResponse("").status).toBe(404);
  });
});
