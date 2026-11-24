/**
 * The client-side logger, for the native app: structured events through evlog's client `log`
 * (console in development), without the server entry's Hono and request-scope imports.
 */
export { log } from "evlog/client";
