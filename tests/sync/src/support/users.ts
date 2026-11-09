import { createHash, randomInt, randomUUID } from "node:crypto";

import pg from "pg";

import { services } from "../prerequisites";

export type TestUser = { userId: string; email: string; cookie: string };

/** Direct access to the database PowerSync replicates from, for assertions and set-up only. */
export const database = new pg.Pool({ connectionString: services.postgresUrl, max: 4 });
// Fault tests cut sessions; an idle pooled client dying must not crash the test process.
database.on("error", () => undefined);

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/**
 * Auth endpoints are rate limited per client IP. The dev server trusts
 * loopback proxies, so each test user presents its own address in X-Forwarded-For.
 */
async function auth(path: string, body: Record<string, string>, ip: string): Promise<Response> {
  return fetch(`${services.apiUrl}/api/auth/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: services.appOrigin,
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

/**
 * A new account through the real code request and redemption endpoints.
 * Seam 3 has no mail inbox, so the issued verification hash is replaced with a known
 * code hash in SQL, the one shortcut. Every test makes its own users,
 * which is how seam 3 isolates data in the shared database PowerSync replicates from.
 */
export async function createUser(): Promise<TestUser> {
  const email = `sync-${randomUUID()}@example.com`;
  const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  const requested = await auth("email-otp/send-verification-otp", { email, type: "sign-in" }, ip);
  if (!requested.ok)
    throw new Error(`code request failed: ${requested.status} ${await requested.text()}`);
  const otp = randomInt(100_000, 1_000_000).toString();
  // Better Auth stores SHA-256 base64url followed by the failed-attempt count.
  const value = `${createHash("sha256").update(otp).digest("base64url")}:0`;
  const updated = await database.query(`UPDATE verification SET value = $1 WHERE identifier = $2`, [
    value,
    `sign-in-otp-${email}`,
  ]);
  if (updated.rowCount !== 1) throw new Error("the requested code is not in the test database");
  const signIn = await auth("sign-in/email-otp", { email, otp, name: "Sync Test" }, ip);
  if (!signIn.ok) throw new Error(`sign-in failed: ${signIn.status} ${await signIn.text()}`);
  const { rows } = await database.query<{ id: string }>(
    `SELECT id FROM "user" WHERE email = $1 AND email_verified = true`,
    [email],
  );
  const userId = rows[0]?.id;
  if (!userId) throw new Error("the signed-in user is not in the database the tests read");
  return { userId, email, cookie: cookieHeader(signIn) };
}

export async function serverExercise(id: string) {
  const { rows } = await database.query<{
    id: string;
    user_id: string | null;
    title: string;
    instructions: string | null;
    secondary_muscles: string[];
    retired_at: Date | null;
  }>(
    "SELECT id, user_id, title, instructions, secondary_muscles, retired_at FROM exercise WHERE id = $1",
    [id],
  );
  return rows[0];
}
