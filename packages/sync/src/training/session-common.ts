import {
  planSupersetRepair,
  REST_SECONDS_MAX,
  SESSION_LIMITS,
  type SupersetChange,
  type SupersetItem,
} from "@workspace/shared";
import { asc, count, eq } from "drizzle-orm";

import { exercise } from "../exercise";
import { installMeta } from "../platform/tables";
import { needsRebalance, rebalanced, sortByPosition, type Positioned } from "./position";
import { totalOf, type Tx } from "./store-common";
import { session, sessionExercise, sessionSet } from "./tables";

export type SessionRow = typeof session.$inferSelect;
export type SessionExerciseRow = typeof sessionExercise.$inferSelect;
export type SessionSetRow = typeof sessionSet.$inferSelect;

/** What a discard removed, so Undo can put it back with the same ids (the server restores them). */
export type DeletedSession = {
  session: SessionRow;
  exercises: SessionExerciseRow[];
  sets: SessionSetRow[];
};

/** A write would pass one of the {@link SESSION_LIMITS}. */
export class SessionLimitError extends Error {
  readonly limit: "exercisesPerSession" | "setsPerExercise";
  constructor(limit: "exercisesPerSession" | "setsPerExercise") {
    super(`Session limit reached: ${limit}`);
    this.name = "SessionLimitError";
    this.limit = limit;
  }
}

export function assertSessionRoom(
  live: number,
  adding: number,
  limit: "exercisesPerSession" | "setsPerExercise",
) {
  if (live + adding > SESSION_LIMITS[limit]) throw new SessionLimitError(limit);
}

/** The install id: which device owns a Session while it is active. */
export async function installIdOf(tx: Tx): Promise<string> {
  const [install] = await tx.select({ id: installMeta.install_id }).from(installMeta).limit(1);
  if (!install) throw new Error("This device has no install id yet");
  return install.id;
}

export async function requireSession(tx: Tx, id: string): Promise<SessionRow> {
  const [row] = await tx.select().from(session).where(eq(session.id, id)).limit(1);
  if (!row) throw new Error("The session is gone");
  return row;
}

export async function requireSessionExercise(tx: Tx, id: string): Promise<SessionExerciseRow> {
  const [row] = await tx.select().from(sessionExercise).where(eq(sessionExercise.id, id)).limit(1);
  if (!row) throw new Error("The exercise is gone from the session");
  return row;
}

export const exercisesInSession = (tx: Tx, sessionId: string) =>
  totalOf(
    tx
      .select({ total: count() })
      .from(sessionExercise)
      .where(eq(sessionExercise.session_id, sessionId)),
  );

export const setsInExercise = (tx: Tx, sessionExerciseId: string) =>
  totalOf(
    tx
      .select({ total: count() })
      .from(sessionSet)
      .where(eq(sessionSet.session_exercise_id, sessionExerciseId)),
  );

/** The library exercise a Session exercise is made from, with what defaults depend on. */
export async function exerciseInfoOf(tx: Tx, exerciseId: string) {
  const [row] = await tx
    .select({
      title: exercise.title,
      exercise_type: exercise.exercise_type,
      equipment: exercise.equipment,
      secondary_muscles: exercise.secondary_muscles,
    })
    .from(exercise)
    .where(eq(exercise.id, exerciseId))
    .limit(1);
  if (!row) throw new Error("The exercise is not in the library");
  return row;
}

export const sessionExerciseListOf = (tx: Tx, sessionId: string) =>
  tx
    .select({ id: sessionExercise.id, position: sessionExercise.position })
    .from(sessionExercise)
    .where(eq(sessionExercise.session_id, sessionId))
    .orderBy(asc(sessionExercise.position), asc(sessionExercise.id));

export const sessionSetListOf = (tx: Tx, sessionExerciseId: string) =>
  tx
    .select({ id: sessionSet.id, position: sessionSet.position })
    .from(sessionSet)
    .where(eq(sessionSet.session_exercise_id, sessionExerciseId))
    .orderBy(asc(sessionSet.position), asc(sessionSet.id));

/** The superset-relevant fields of a Session's exercises, in order. */
export const sessionSupersetRowsOf = (tx: Tx, sessionId: string): Promise<SupersetItem[]> =>
  tx
    .select({
      id: sessionExercise.id,
      superset_group: sessionExercise.superset_group,
      rest_seconds: sessionExercise.rest_seconds,
    })
    .from(sessionExercise)
    .where(eq(sessionExercise.session_id, sessionId))
    .orderBy(asc(sessionExercise.position), asc(sessionExercise.id));

export async function applySessionSupersetChanges(tx: Tx, changes: readonly SupersetChange[]) {
  for (const { id, ...fields } of changes) {
    await tx.update(sessionExercise).set(fields).where(eq(sessionExercise.id, id));
  }
}

/** A group of one is no group, and only the last member of a group holds its rest. */
export async function repairSessionSupersets(tx: Tx, sessionId: string) {
  await applySessionSupersetChanges(
    tx,
    planSupersetRepair(await sessionSupersetRowsOf(tx, sessionId)),
  );
}

/** Renumbers a list whose keys grew long or collided, in the same transaction as the write. */
export async function rebalanceSessionExercises(tx: Tx, items: Positioned[]) {
  if (!needsRebalance(items)) return items;
  const changes = rebalanced(items);
  for (const change of changes) {
    await tx
      .update(sessionExercise)
      .set({ position: change.position })
      .where(eq(sessionExercise.id, change.id));
  }
  const byId = new Map(changes.map((change) => [change.id, change.position]));
  return sortByPosition(
    items.map((item) => ({ ...item, position: byId.get(item.id) ?? item.position })),
  );
}

export async function rebalanceSessionSets(tx: Tx, items: Positioned[]) {
  if (!needsRebalance(items)) return items;
  const changes = rebalanced(items);
  for (const change of changes) {
    await tx
      .update(sessionSet)
      .set({ position: change.position })
      .where(eq(sessionSet.id, change.id));
  }
  const byId = new Map(changes.map((change) => [change.id, change.position]));
  return sortByPosition(
    items.map((item) => ({ ...item, position: byId.get(item.id) ?? item.position })),
  );
}

export type RestTimes = { startedAt: string; endsAt: string };

/** Whether `seconds` is a Rest length the Session accepts: 1 to 600. */
export const isRestSeconds = (seconds: number) =>
  Number.isInteger(seconds) && seconds >= 1 && seconds <= REST_SECONDS_MAX;

/**
 * Records the Rest a set started on its Session, replacing a running one, as absolute times so the
 * countdown survives the app being killed. The caller has checked the set belongs to the Session.
 */
export async function writeRest(
  tx: Tx,
  sessionId: string,
  setId: string,
  seconds: number,
): Promise<RestTimes> {
  const start = Date.now();
  const times = {
    startedAt: new Date(start).toISOString(),
    endsAt: new Date(start + seconds * 1000).toISOString(),
  };
  await tx
    .update(session)
    .set({ rest_set_id: setId, rest_started_at: times.startedAt, rest_ends_at: times.endsAt })
    .where(eq(session.id, sessionId));
  return times;
}
