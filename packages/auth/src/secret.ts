export const MIN_AUTH_SECRET_LENGTH = 32;

/** Refuses a missing, short or visibly low-entropy secret; the server exits on it. */
export function assertStrongSecret(secret: string | undefined): string {
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is not set. Generate one with: openssl rand -hex 32");
  }
  if (secret.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error("BETTER_AUTH_SECRET is shorter than 32 characters. Generate a new one.");
  }
  // A repeated character or a handful of distinct characters is a placeholder.
  if (new Set(secret).size < 8) {
    throw new Error("BETTER_AUTH_SECRET has too little variety. Generate a new one.");
  }
  return secret;
}
