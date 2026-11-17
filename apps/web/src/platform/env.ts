import { createWebEnv } from "@workspace/env/web";

/** Public build-time values only (see `@workspace/env/web`). */
export const env = createWebEnv(import.meta.env);
