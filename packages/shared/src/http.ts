/**
 * Request header the server sets from the trusted-proxy walk. Clients can never
 * supply it: the client-IP middleware deletes any incoming value first.
 */
export const CLIENT_IP_HEADER = "x-client-ip";

/** Header carrying the Turnstile token on auth requests. */
export const TURNSTILE_TOKEN_HEADER = "x-turnstile-token";

/** The widget action the clients render; the server's CAPTCHA verifier insists on it. */
export const TURNSTILE_ACTION = "auth";
