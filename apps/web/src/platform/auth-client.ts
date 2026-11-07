import { createAppAuthClient } from "@workspace/client/auth-client";

import { env } from "./env";

export const authClient = createAppAuthClient(env.VITE_SERVER_URL);
