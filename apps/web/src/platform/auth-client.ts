import { createAppAuthClient } from "@workspace/client/auth-client";
import { twoFactorClient } from "better-auth/client/plugins";

import { siteOrigin } from "./origin";

function create() {
  return createAppAuthClient(siteOrigin(), twoFactorClient());
}

let client: ReturnType<typeof create> | undefined;

/** Better Auth on the site's origin (the Worker forwards `/api/auth`), with the two-factor plugin. */
export function getAuthClient() {
  client ??= create();
  return client;
}
