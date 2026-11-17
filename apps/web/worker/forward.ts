/**
 * The site's Worker decisions as pure functions (tested without a runtime). The browser talks only
 * to the site's origin: `/rpc` and `/api` are forwarded to the API host, `/download` redirects to
 * the newest APK, `/admin` and `/invite` get the client-only shell, and everything else is a static asset.
 */

export type Destination = "api" | "download" | "shell" | "assets";

export function destinationFor(pathname: string): Destination {
  if (/^\/(rpc|api)(\/|$)/.test(pathname)) return "api";
  if (pathname === "/download" || pathname === "/download/") return "download";
  if (/^\/admin(\/|$)/.test(pathname) || pathname === "/invite") return "shell";
  return "assets";
}

/**
 * Headers that must not travel to the API: hop-by-hop ones, Cloudflare's own, the host, and any
 * client-sent value of the headers the API trusts for the client's address.
 */
const DROPPED = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "x-client-ip",
  "forwarded",
]);

/**
 * The headers of the forwarded request. Cookies, `Origin`, content and language headers pass
 * unchanged. The visitor's address (Cloudflare's `CF-Connecting-IP`, never a client-sent value)
 * starts a fresh `X-Forwarded-For`; Cloudflare in front of the API appends its own hop, and the
 * API's resolver walks the chain from the right through trusted proxies.
 */
export function forwardHeaders(incoming: Headers, siteHost: string): Headers {
  const headers = new Headers();
  const clientIp = incoming.get("cf-connecting-ip");
  for (const [name, value] of incoming) {
    const lower = name.toLowerCase();
    if (DROPPED.has(lower) || lower.startsWith("cf-")) continue;
    headers.append(name, value);
  }
  if (clientIp) headers.set("x-forwarded-for", clientIp);
  headers.set("x-forwarded-host", siteHost);
  headers.set("x-forwarded-proto", "https");
  return headers;
}

/** The request to the API: same method, path, query, body and (filtered) headers. */
export function forwardRequest(request: Request, apiOrigin: string): Request {
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, apiOrigin);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return new Request(target, {
    method: request.method,
    headers: forwardHeaders(request.headers, incoming.host),
    ...(hasBody ? { body: request.body, duplex: "half" } : {}),
    // A redirect from the API goes back to the browser as it is.
    redirect: "manual",
  });
}
