import { buildAppleSiteAssociation, buildAssetLinks } from "@workspace/shared";
import { Hono } from "hono";

import type { ApiConfig } from "./config";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
} as const;

type WellKnownDocument =
  | ReturnType<typeof buildAssetLinks>
  | ReturnType<typeof buildAppleSiteAssociation>;

/** The JSON document as a response, or 404 when the app is not configured for it. */
function wellKnownResponse(document: WellKnownDocument): Response {
  return document
    ? new Response(JSON.stringify(document), { headers: JSON_HEADERS })
    : new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
}

/**
 * The files that let the native apps use this host's passkeys: `assetlinks.json` for Android and
 * `apple-app-site-association` for iOS. Each answers 404 until the app's signing identity is set.
 */
export function wellKnownRoutes(association: ApiConfig["appAssociation"]) {
  const routes = new Hono();
  routes.get("/assetlinks.json", () =>
    wellKnownResponse(
      buildAssetLinks({
        packageName: association.androidPackage,
        fingerprints: association.androidCertFingerprints,
      }),
    ),
  );
  routes.get("/apple-app-site-association", () =>
    wellKnownResponse(
      buildAppleSiteAssociation({
        teamId: association.appleTeamId,
        bundleId: association.iosBundleId,
      }),
    ),
  );
  return routes;
}
