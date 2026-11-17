import type { Database } from "@workspace/db";
import { session, user } from "@workspace/db/schema/auth";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

/**
 * What the admin may see of an account (story 26 and 31): identity, sign-in facts, ban state,
 * the app version last seen and how many rows of each kind it holds. Never a set, a body metric,
 * a note or a media URL.
 */
export const accountViewSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(["admin", "user"]),
  createdAt: z.string(),
  lastSignInAt: z.string().nullable(),
  lastSignInMethod: z.string().nullable(),
  banned: z.boolean(),
  banReason: z.string().nullable(),
  lastSeenAppVersion: z.string().nullable(),
  lastSeenAppAt: z.string().nullable(),
  counts: z.object({
    programs: z.number().int(),
    sessions: z.number().int(),
    customExercises: z.number().int(),
    media: z.number().int(),
  }),
});
export type AccountView = z.infer<typeof accountViewSchema>;

export const accountRowSchema = accountViewSchema.omit({ counts: true, lastSeenAppAt: true });

const countsSchema = z.object({
  programs: z.coerce.number(),
  sessions: z.coerce.number(),
  custom_exercises: z.coerce.number(),
  media: z.coerce.number(),
});

const lastSignIn = sql<Date | null>`(SELECT max(${session.createdAt}) FROM ${session} WHERE ${session.userId} = ${user.id})`;

const columns = {
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  createdAt: user.createdAt,
  lastSignInAt: lastSignIn,
  lastSignInMethod: user.lastLoginMethod,
  banned: user.banned,
  banReason: user.banReason,
  lastSeenAppVersion: user.lastSeenAppVersion,
  lastSeenAppAt: user.lastSeenAppAt,
};

type Row = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  createdAt: Date;
  lastSignInAt: Date | string | null;
  lastSignInMethod: string | null;
  banned: boolean | null;
  banReason: string | null;
  lastSeenAppVersion: string | null;
  lastSeenAppAt: Date | null;
};

const iso = (value: Date | string | null) =>
  value === null ? null : new Date(value).toISOString();

function toRow(row: Row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role === "admin" ? ("admin" as const) : ("user" as const),
    createdAt: row.createdAt.toISOString(),
    lastSignInAt: iso(row.lastSignInAt),
    lastSignInMethod: row.lastSignInMethod,
    banned: row.banned === true,
    banReason: row.banReason,
    lastSeenAppVersion: row.lastSeenAppVersion,
  };
}

export type ListUsersInput = {
  search?: string | undefined;
  banned?: boolean | undefined;
  page: number;
  limit: number;
};

/** One page of accounts, newest first, searched by email or name. */
export async function listUsers(db: Database, input: ListUsersInput) {
  const filters: SQL[] = [];
  const search = input.search?.trim();
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const match = or(ilike(user.email, pattern), ilike(user.name, pattern));
    if (match) filters.push(match);
  }
  if (input.banned !== undefined) {
    filters.push(input.banned ? eq(user.banned, true) : sql`${user.banned} IS NOT TRUE`);
  }
  const where = filters.length > 0 ? and(...filters) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select(columns)
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(user)
      .where(where),
  ]);
  return { users: rows.map(toRow), total: total?.count ?? 0 };
}

/** The account view of one user, or null when there is none. */
export async function getAccountView(db: Database, userId: string): Promise<AccountView | null> {
  const [row] = await db.select(columns).from(user).where(eq(user.id, userId)).limit(1);
  if (!row) return null;
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM program WHERE user_id = ${userId} AND deleted_at IS NULL) AS programs,
      (SELECT count(*) FROM training_session WHERE user_id = ${userId} AND deleted_at IS NULL)
        AS sessions,
      (SELECT count(*) FROM exercise WHERE user_id = ${userId}) AS custom_exercises,
      (SELECT count(*) FROM media WHERE user_id = ${userId} AND deleted_at IS NULL) AS media`);
  const [counts] = z.object({ rows: z.array(countsSchema).length(1) }).parse(result).rows;
  if (!counts) throw new Error("Account counts query returned no row");
  return {
    ...toRow(row),
    lastSeenAppAt: iso(row.lastSeenAppAt),
    counts: {
      programs: counts.programs,
      sessions: counts.sessions,
      customExercises: counts.custom_exercises,
      media: counts.media,
    },
  };
}
