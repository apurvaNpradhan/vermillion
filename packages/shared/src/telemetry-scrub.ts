/**
 * Pure helpers that keep personal data out of crash reports (native and server). They work on
 * plain strings, so each runtime applies them to its own Sentry event shape.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** A path segment that is long and made of token characters: a reset token, a session id, a uuid. */
const TOKEN_SEGMENT = /^[A-Za-z0-9_-]{24,}$/;
const USERINFO = /^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i;

/** Replaces every email address in the text. */
export function redactEmails(text: string): string {
  return text.replace(EMAIL, "[email]");
}

/**
 * A URL without its query string, fragment and credentials; long token-like path segments become
 * `:token`. Query strings carry sign-in codes and signed-URL signatures, so they never leave.
 */
export function scrubUrl(url: string): string {
  const bare = url.replace(/[?#][\s\S]*$/, "").replace(USERINFO, "$1");
  return bare
    .split("/")
    .map((segment) => (TOKEN_SEGMENT.test(segment) ? ":token" : segment))
    .join("/");
}
