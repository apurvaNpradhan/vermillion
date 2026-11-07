import { getConnInfo } from "@hono/node-server/conninfo";
import { CLIENT_IP_HEADER } from "@workspace/shared";
import type { MiddlewareHandler } from "hono";
import { BlockList, isIP } from "node:net";

const DEFAULT_TRUSTED_PROXIES = "127.0.0.0/8,::1/128";

/**
 * Builds the resolver for the configured trusted proxies (Traefik, Cloudflare).
 * `X-Forwarded-For` is walked from the right and only through trusted hops, so
 * a spoofed leftmost value never wins.
 */
export function createClientIpResolver(trustedProxies?: string) {
  const trusted = new BlockList();
  const raw = trustedProxies?.trim() || DEFAULT_TRUSTED_PROXIES;
  for (const entry of raw === "none" ? [] : raw.split(",")) {
    const parts = entry.trim().split("/");
    const [address = "", prefix] = parts;
    const family = isIP(address);
    const bits = family === 4 ? 32 : 128;
    if (
      !family ||
      parts.length > 2 ||
      (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > bits))
    ) {
      throw new Error("TRUSTED_PROXIES must contain valid IP addresses or CIDR ranges, or 'none'");
    }
    const type = family === 4 ? "ipv4" : "ipv6";
    if (prefix === undefined) trusted.addAddress(address, type);
    else trusted.addSubnet(address, Number(prefix), type);
  }
  const isTrusted = (address: string) =>
    trusted.check(address, isIP(address) === 4 ? "ipv4" : "ipv6");

  return (peer: string | undefined, forwarded: string | undefined): string | null => {
    if (!peer || !isIP(peer)) return null;
    if (!isTrusted(peer) || !forwarded || forwarded.length > 8192) return peer;
    const hops = forwarded.split(",");
    if (hops.length > 64) return peer;
    let current = peer;
    for (let i = hops.length - 1; i >= 0; i--) {
      if (!isTrusted(current)) break;
      const candidate = hops[i]?.trim() ?? "";
      // A malformed chain has no reliable client identity; keep the transport peer.
      if (!isIP(candidate)) return peer;
      current = candidate;
    }
    return current;
  };
}

/** Sets the trusted client IP header for everything downstream, replacing any client-sent value. */
export function clientIpMiddleware(trustedProxies?: string): MiddlewareHandler {
  const resolve = createClientIpResolver(trustedProxies);
  return async (c, next) => {
    let peer: string | undefined;
    // `app.request()` and non-Node adapters have no socket. Headers are not
    // trusted then: rate limits fall into Better Auth's shared fallback bucket.
    try {
      peer = getConnInfo(c).remote.address;
    } catch {
      /* no transport peer */
    }
    const ip = resolve(peer, c.req.header("x-forwarded-for"));
    const headers = new Headers(c.req.raw.headers);
    headers.delete(CLIENT_IP_HEADER);
    if (ip) headers.set(CLIENT_IP_HEADER, ip);
    c.req.raw = new Request(c.req.raw, { headers });
    await next();
  };
}
