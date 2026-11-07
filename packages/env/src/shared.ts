/** Weak or placeholder secrets are refused in production. */
export const PLACEHOLDER_SECRET =
  /^(replace|change|changeme|secret|password|example|placeholder|test|dev)/i;

/** Fails startup with the validation issues printed; shared by every server-side env entry. */
export function exitOnInvalidEnv(label: string) {
  return (issues: readonly { message: string }[]): never => {
    console.error(`Invalid ${label}:`, JSON.stringify(issues, null, 2));
    process.exit(1);
  };
}
