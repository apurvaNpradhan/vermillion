import { normalizeShareCode, SHARE_PATH_PREFIX } from "@workspace/shared";

const DESTINATIONS = [
  "/",
  "/exercises",
  "/body/weight",
  "/body/measurements",
  "/settings",
  "/settings/profile",
  "/confirm-deletion",
] as const;

type ReturnLocation =
  | { pathname: (typeof DESTINATIONS)[number]; params: Record<string, string> }
  | { pathname: "/p/[code]" | "/w/[code]"; params: { code: string } };

/** The in-app import preview for a Share link on the site host (`https://<site>/p/<code>`). */
function shareLinkLocation(url: URL, siteHost: string): ReturnLocation | null {
  if (url.host.toLowerCase() !== siteHost.toLowerCase() || url.username || url.password)
    return null;
  const match = /^\/([pw])\/([^/]+)\/?$/.exec(url.pathname);
  const code = normalizeShareCode(match?.[2] ?? "");
  if (!match || !code) return null;
  return {
    pathname: match[1] === SHARE_PATH_PREFIX.program ? "/p/[code]" : "/w/[code]",
    params: { code },
  };
}

/**
 * Accept only known native destinations from this app’s scheme (or Expo development links), and
 * the Share links (`/p/<code>`, `/w/<code>`) of the site host when it is given: an App Link opened
 * signed out returns to the import preview after sign-in.
 */
export function nativeReturnLocation(
  value: string | null,
  scheme: string,
  siteHost?: string,
): ReturnLocation | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && siteHost) return shareLinkLocation(url, siteHost);
    let path: string;
    // OAuth cookies are credentials for the Expo plugin, never navigation parameters.
    if (url.searchParams.has("cookie") || url.searchParams.has("error")) return null;
    if (url.protocol === `${scheme}:`)
      path = url.hostname ? `/${url.hostname}${url.pathname}` : url.pathname;
    else if (url.protocol === "exp:" || url.protocol === "exps:")
      path = url.pathname.replace(/^\/--(?=\/)/, "");
    else return null;
    const pathname = DESTINATIONS.find((candidate) => candidate === path);
    if (!pathname || url.username || url.password) return null;
    const params: Record<string, string> = Object.fromEntries(url.searchParams);
    return { pathname, params };
  } catch {
    return null;
  }
}

/** OAuth emits a second root/callback URL before session refresh; do not replace the user’s destination. */
export function captureNativeReturnLocation(
  pending: ReturnType<typeof nativeReturnLocation>,
  value: string | null,
  scheme: string,
  siteHost?: string,
) {
  const destination = nativeReturnLocation(value, scheme, siteHost);
  if (!destination || (pending && destination.pathname === "/")) return pending;
  return destination;
}
