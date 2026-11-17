import { createRpc, type Rpc } from "@workspace/client/rpc";

import { siteOrigin } from "./origin";

let rpc: Rpc | undefined;

/** The typed client for the site's own origin; module hooks use it, components never do. */
export function getRpc(): Rpc {
  rpc ??= createRpc({ serverUrl: siteOrigin() });
  return rpc;
}
