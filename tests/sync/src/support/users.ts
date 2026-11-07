import { randomInt, randomUUID } from "node:crypto";

import pg from "pg";

import { services } from "../prerequisites";

const PASSWORD = "correct-horse-battery";

export type TestUser = { userId: string; email: string; cookie: string };

/** Direct access to the database PowerSync replicates from, for assertions and set-up only. */
export const database = new pg.Pool({ connectionString: services.postgresUrl, max: 4 });

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/**
 * Auth endpoints are rate limited per client IP (5 sign-ups a minute). The dev server trusts
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
 * A new account through the real auth API: sign-up, then sign-in for the session cookie.
 * Seam 3 has no mail inbox, so the verification email is not clicked; the address is
 * marked verified in the database, the one shortcut. Every test makes its own users,
 * which is how seam 3 isolates data in the shared database PowerSync replicates from.
 */
export async function createUser(): Promise<TestUser> {
  const email = `sync-${randomUUID()}@example.com`;
  const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  const signUp = await auth("sign-up/email", { email, password: PASSWORD, name: "Sync Test" }, ip);
  if (!signUp.ok) throw new Error(`sign-up failed: ${signUp.status} ${await signUp.text()}`);
  const { rows } = await database.query<{ id: string }>(
    `UPDATE "user" SET email_verified = true WHERE email = $1 RETURNING id`,
    [email],
  );
  const userId = rows[0]?.id;
  if (!userId) throw new Error("the signed-up user is not in the database the tests read");
  const signIn = await auth("sign-in/email", { email, password: PASSWORD }, ip);
  if (!signIn.ok) throw new Error(`sign-in failed: ${signIn.status} ${await signIn.text()}`);
  return { userId, email, cookie: cookieHeader(signIn) };
}

export async function serverNote(id: string) {
  const { rows } = await database.query<{
    id: string;
    user_id: string;
    title: string;
    body: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }>("SELECT * FROM notes WHERE id = $1", [id]);
  return rows[0];
}
