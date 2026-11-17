/**
 * Request header the server sets from the trusted-proxy walk. Clients can never
 * supply it: the client-IP middleware deletes any incoming value first.
 */
export const CLIENT_IP_HEADER = "x-client-ip";

/** Header carrying the Turnstile token on auth requests. */
export const TURNSTILE_TOKEN_HEADER = "x-turnstile-token";

/** The widget action the clients render; the server's CAPTCHA verifier insists on it. */
export const TURNSTILE_ACTION = "auth";

/**
 * Header the native app sends on API calls: its version and build number (`1.2.0+45`). The server
 * records it on the account at most once a day; nothing else depends on it.
 */
export const APP_VERSION_HEADER = "x-app-version";
