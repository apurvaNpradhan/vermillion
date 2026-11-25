import { z } from "zod";

import type { TrainingDatabase } from "../store-common";

/** The newest Sessions one read returns; enough to cover two years of training. */
const SESSION_STARTS_LIMIT = 5000;

const rowSchema = z.object({ started_at: z.string(), finished_at: z.string().nullable() });

export type SessionStart = { startedAt: string; finished: boolean };

const SESSION_STARTS_SQL = `SELECT started_at, finished_at FROM training_session
  WHERE started_at >= ? ORDER BY started_at DESC, id DESC LIMIT ${SESSION_STARTS_LIMIT}`;

function parse(rows: readonly object[]): SessionStart[] {
  return z
    .array(rowSchema)
    .parse(rows)
    .map((row) => ({ startedAt: row.started_at, finished: row.finished_at !== null }));
}

/** When Sessions started at or after `from` (an ISO time), finished or not, newest first. */
export async function readSessionStarts(
  database: Pick<TrainingDatabase, "getAll">,
  from: string,
): Promise<SessionStart[]> {
  return parse(await database.getAll(SESSION_STARTS_SQL, [from]));
}

/** Watches {@link readSessionStarts}: what the reminders reschedule from. */
export function watchSessionStarts(
  database: TrainingDatabase,
  from: string,
  onValue: (starts: SessionStart[]) => void,
  onError: () => void,
) {
  const controller = new AbortController();
  let last = "";
  database.watchWithCallback(
    SESSION_STARTS_SQL,
    [from],
    {
      onResult: (result) => {
        try {
          if (controller.signal.aborted) return;
          const starts = parse(result.array);
          // A write to another column of a Session leaves the answer as it was.
          const key = JSON.stringify(starts);
          if (key === last) return;
          last = key;
          onValue(starts);
        } catch {
          onError();
        }
      },
      onError,
    },
    { signal: controller.signal, tables: ["training_session"], throttleMs: 0 },
  );
  return () => controller.abort();
}
