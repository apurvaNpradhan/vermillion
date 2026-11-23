import { createFileRoute } from "@tanstack/react-router";

import { appConfig } from "../../../../../app.config.ts";
import { buildAssetLinks } from "../../share/assetlinks.ts";

/**
 * Android App Links verification (ADR 0058). Android fetches this file once per install with no
 * redirects, and needs a JSON content type. The fingerprints are `androidCertSha256` in
 * app.config.ts.
 */
export const Route = createFileRoute("/.well-known/assetlinks.json")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          JSON.stringify(
            buildAssetLinks(appConfig.bundleIds.android, appConfig.androidCertSha256),
            null,
            2,
          ),
          {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "public, max-age=3600",
            },
          },
        ),
    },
  },
});
