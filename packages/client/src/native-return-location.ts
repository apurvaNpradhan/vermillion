const DESTINATIONS = [
  "/",
  "/notes",
  "/settings",
  "/settings/profile",
  "/confirm-deletion",
] as const;

/** Accept only known native destinations from this app’s scheme (or Expo development links). */
export function nativeReturnLocation(value: string | null, scheme: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
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
    const params = Object.fromEntries(url.searchParams);
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
) {
  const destination = nativeReturnLocation(value, scheme);
  if (!destination || (pending && destination.pathname === "/")) return pending;
  return destination;
}
