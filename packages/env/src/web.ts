import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Public build-time values of the site (`apps/web`). Nothing secret belongs here: the bundle is
 * served to browsers. Pass the framework's env object: `createWebEnv(import.meta.env)`. The
 * site's own URL comes from app.config.ts, and the browser calls its own origin.
 */
export function createWebEnv(runtimeEnv: Record<string, string | boolean | number | undefined>) {
  return createEnv({
    clientPrefix: "VITE_",
    client: {
      /** Turnstile site key for the request-access form; the widget is shown only when set. */
      VITE_TURNSTILE_SITE_KEY: z.string().optional(),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
  });
}

/**
 * Bindings of the site's Worker (`apps/web/wrangler.jsonc`): `API_ORIGIN` is where `/rpc` and
 * `/api` are forwarded. The static-assets binding is typed by the Worker itself.
 */
export const workerVarsSchema = z.object({ API_ORIGIN: z.url() });
export type WorkerVars = z.infer<typeof workerVarsSchema>;
