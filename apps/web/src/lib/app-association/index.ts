import { buildAppleSiteAssociation, buildAssetLinks, parseCsv } from "@workspace/shared";

import { appConfig } from "../../platform/app-config";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
} as const;

type WellKnownDocument =
  | ReturnType<typeof buildAssetLinks>
  | ReturnType<typeof buildAppleSiteAssociation>;

/** The JSON document as a response, or 404 when the app is not configured for it. */
export function wellKnownResponse(document: WellKnownDocument): Response {
  return document
    ? new Response(JSON.stringify(document), { headers: JSON_HEADERS })
    : new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
}

/** `/.well-known/assetlinks.json`: lets the Android app use this domain's passkeys. */
export function assetLinksResponse(fingerprints: string | undefined): Response {
  return wellKnownResponse(
    buildAssetLinks({
      packageName: appConfig.bundleIds.android,
      fingerprints: parseCsv(fingerprints),
    }),
  );
}

/** `/.well-known/apple-app-site-association`: lets the iOS app use this domain's passkeys. */
export function appleAssociationResponse(teamId: string | undefined) {
  return wellKnownResponse(
    buildAppleSiteAssociation({ teamId, bundleId: appConfig.bundleIds.ios }),
  );
}
