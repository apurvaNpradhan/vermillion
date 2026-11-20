import { EXERCISE_TYPES, SET_KINDS, type SessionExportRow } from "@workspace/shared";
import { z } from "zod";

/** Sets one export read pulls; the export pages through everything. */
const EXPORT_PAGE = 2000;

/**
 * Every ticked set of every finished Session, oldest first, with its Session and exercise: what the
 * data export writes. Paged with LIMIT and OFFSET over a total order, so a page never repeats or
 * skips a row while nothing changes.
 */
export const SESSION_EXPORT_SQL = `SELECT s.id AS session_id, s.title AS title, s.started_at AS started_at,
    s.note AS session_note, se.id AS exercise_row, se.exercise_title AS exercise_title,
    se.exercise_type AS exercise_type, se.note AS exercise_note, ss.kind AS kind,
    ss.weight_kg AS weight_kg, ss.reps AS reps, ss.duration_s AS duration_s,
    ss.distance_m AS distance_m, ss.rpe AS rpe
  FROM training_session s
  JOIN session_exercise se ON se.session_id = s.id
  JOIN session_set ss ON ss.session_exercise_id = se.id AND ss.completed_at IS NOT NULL
  WHERE s.finished_at IS NOT NULL
  ORDER BY s.started_at, s.id, se.position, se.id, ss.position, ss.id
  LIMIT ? OFFSET ?`;

const exportRowSchema = z.object({
  session_id: z.string(),
  title: z.string(),
  started_at: z.string(),
  session_note: z.string().nullable(),
  exercise_row: z.string(),
  exercise_title: z.string().nullable(),
  exercise_type: z.enum(EXERCISE_TYPES).nullable(),
  exercise_note: z.string().nullable(),
  kind: z.enum(SET_KINDS),
  weight_kg: z.number().nullable(),
  reps: z.number().nullable(),
  duration_s: z.number().nullable(),
  distance_m: z.number().nullable(),
  rpe: z.number().nullable(),
});

/** What an export read needs of a database. */
type ExportReader = {
  getAll: (sql: string, parameters: (string | number)[]) => Promise<readonly object[]>;
};

/** Reads the export rows of every finished Session, page by page. */
export async function readSessionExportRows(database: ExportReader): Promise<SessionExportRow[]> {
  const rows: SessionExportRow[] = [];
  for (let offset = 0; ; offset += EXPORT_PAGE) {
    const page = z
      .array(exportRowSchema)
      .parse(await database.getAll(SESSION_EXPORT_SQL, [EXPORT_PAGE, offset]));
    for (const row of page) {
      rows.push({
        sessionId: row.session_id,
        workout: row.title,
        startedAt: row.started_at,
        sessionNote: row.session_note,
        exerciseKey: row.exercise_row,
        exercise: row.exercise_title ?? "",
        exerciseNote: row.exercise_note,
        kind: row.kind,
        weightKg: row.weight_kg,
        reps: row.reps,
        durationS: row.duration_s,
        distanceM: row.distance_m,
        rpe: row.rpe,
      });
    }
    if (page.length < EXPORT_PAGE) return rows;
  }
}
