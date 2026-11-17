import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { AppRouterClient } from "@workspace/api/client";
import { workerVarsSchema } from "@workspace/env/web";

import { destinationFor, forwardRequest } from "./forward";

/** The static-assets binding (wrangler.jsonc `assets.binding`). */
type AssetsBinding = { fetch(request: Request): Promise<Response> };
type Bindings = { ASSETS: AssetsBinding; API_ORIGIN: string };

/** Where the newest APK is: the API's cached GitHub lookup (the same one the app reads). */
async function latestDownload(apiOrigin: string): Promise<string | null> {
  const link = new RPCLink({ origin: apiOrigin, url: "/rpc" });
  const client: AppRouterClient = createORPCClient(link);
  try {
    const status = await client.release.status();
    return status.latest?.url ?? null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, bindings: Bindings): Promise<Response> {
    const { API_ORIGIN } = workerVarsSchema.parse(bindings);
    const url = new URL(request.url);
    switch (destinationFor(url.pathname)) {
      case "api":
        return fetch(forwardRequest(request, API_ORIGIN));
      case "download": {
        const target = await latestDownload(API_ORIGIN);
        // No release yet: the prerendered /download page says so.
        return target ? Response.redirect(target, 302) : bindings.ASSETS.fetch(request);
      }
      case "shell":
        // The admin renders on the client only: every path gets the SPA shell.
        return bindings.ASSETS.fetch(new Request(new URL("/_shell", url), request));
      case "assets":
        return bindings.ASSETS.fetch(request);
    }
  },
};
