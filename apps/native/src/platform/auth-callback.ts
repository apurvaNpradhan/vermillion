export const AUTH_ATTEMPT_PARAM = "authAttempt";

/** Match the whole callback target and this launch, including after another tab is opened. */
export function matchesCallback(url: string, expected: URL) {
  try {
    const actual = new URL(url);
    return (
      actual.protocol === expected.protocol &&
      actual.host === expected.host &&
      actual.pathname === expected.pathname &&
      expected.searchParams.has(AUTH_ATTEMPT_PARAM) &&
      actual.searchParams.get(AUTH_ATTEMPT_PARAM) === expected.searchParams.get(AUTH_ATTEMPT_PARAM)
    );
  } catch {
    return false;
  }
}
