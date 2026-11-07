import { createRpc } from "@workspace/client/rpc";

import { env } from "./env";

/** Same-origin calls with the session cookie; components reach these only through module hooks. */
export const { client, orpc } = createRpc({ serverUrl: env.VITE_SERVER_URL });
