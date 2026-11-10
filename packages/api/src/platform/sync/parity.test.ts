import { readFileSync } from "node:fs";

import { createDb } from "@workspace/db";
import { runMigrations } from "@workspace/db/migrator";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { cloneDatabase, createTemplate, dropDatabase, urlForDatabase } from "../testing/postgres";
import {
  compareStreams,
  compareToExpectation,
  introspectPostgres,
  parseStreams,
  type Expectation,
} from "./parity";
import { syncTableHandlers } from "./registry";

let database: string;
let client: Client;

beforeAll(async () => {
  database = await cloneDatabase(inject("testTemplateDatabase"), inject("testRunId"));
  client = new Client({ connectionString: urlForDatabase(database) });
  await client.connect();
});

afterAll(async () => {
  await client?.end();
  if (database) await dropDatabase(database);
});

/**
 * The declared expectation. Synced tables join it as they are added: columns, types,
 * nullability, defaults, indexes and publication membership. */
const expectation: Expectation = {
  tables: {
    // Legacy (ADR 0035): the notes example vertical is gone, but its tables stay in Postgres and in
    // the publication because migrations are additive-only. No stream, handler or router uses them.
    notes: {
      columns: {
        id: { type: "uuid", notNull: true, default: null },
        user_id: { type: "text", notNull: true, default: null },
        title: { type: "text", notNull: true, default: null },
        body: { type: "text", notNull: true, default: "''::text" },
        created_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        updated_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        deleted_at: { type: "timestamp with time zone", notNull: false, default: null },
      },
      indexes: {
        notes_user_id_updated_at_idx:
          "CREATE INDEX notes_user_id_updated_at_idx ON public.notes USING btree (user_id, updated_at)",
        notes_user_id_live_idx:
          "CREATE INDEX notes_user_id_live_idx ON public.notes USING btree (user_id) WHERE (deleted_at IS NULL)",
      },
    },
    exercise: {
      columns: {
        id: { type: "uuid", notNull: true, default: null },
        user_id: { type: "text", notNull: false, default: null },
        title: { type: "text", notNull: true, default: null },
        primary_muscle: { type: "text", notNull: true, default: null },
        secondary_muscles: { type: "text[]", notNull: true, default: "'{}'::text[]" },
        equipment: { type: "text", notNull: true, default: null },
        exercise_type: { type: "text", notNull: true, default: null },
        is_full_bodyweight: { type: "boolean", notNull: true, default: "false" },
        rank: { type: "smallint", notNull: true, default: "0" },
        search_terms: { type: "text", notNull: false, default: null },
        aka: { type: "text", notNull: false, default: null },
        instructions: { type: "text", notNull: false, default: null },
        video_key: { type: "text", notNull: false, default: null },
        thumbnail_key: { type: "text", notNull: false, default: null },
        retired_at: { type: "timestamp with time zone", notNull: false, default: null },
        created_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        updated_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
      },
      indexes: {
        exercise_user_id_idx:
          "CREATE INDEX exercise_user_id_idx ON public.exercise USING btree (user_id) WHERE (user_id IS NOT NULL)",
        exercise_catalog_title_uidx:
          "CREATE UNIQUE INDEX exercise_catalog_title_uidx ON public.exercise USING btree (title) WHERE (user_id IS NULL)",
      },
    },
    program: {
      columns: {
        id: { type: "uuid", notNull: true, default: null },
        user_id: { type: "text", notNull: true, default: null },
        title: { type: "text", notNull: true, default: null },
        description: { type: "text", notNull: false, default: null },
        planned_weeks: { type: "smallint", notNull: false, default: null },
        cover_key: { type: "text", notNull: false, default: null },
        created_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        updated_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        deleted_at: { type: "timestamp with time zone", notNull: false, default: null },
      },
      indexes: {
        program_user_id_live_idx:
          "CREATE INDEX program_user_id_live_idx ON public.program USING btree (user_id) WHERE (deleted_at IS NULL)",
      },
    },
    workout: {
      columns: {
        id: { type: "uuid", notNull: true, default: null },
        user_id: { type: "text", notNull: true, default: null },
        program_id: { type: "uuid", notNull: false, default: null },
        title: { type: "text", notNull: false, default: null },
        note: { type: "text", notNull: false, default: null },
        created_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        updated_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        deleted_at: { type: "timestamp with time zone", notNull: false, default: null },
      },
      indexes: {
        workout_user_id_live_idx:
          "CREATE INDEX workout_user_id_live_idx ON public.workout USING btree (user_id) WHERE (deleted_at IS NULL)",
        workout_program_id_idx:
          "CREATE INDEX workout_program_id_idx ON public.workout USING btree (program_id)",
      },
    },
    workout_exercise: {
      columns: {
        id: { type: "uuid", notNull: true, default: null },
        user_id: { type: "text", notNull: true, default: null },
        workout_id: { type: "uuid", notNull: true, default: null },
        exercise_id: { type: "uuid", notNull: true, default: null },
        position: { type: "text", notNull: true, default: null },
        rest_seconds: { type: "smallint", notNull: false, default: null },
        note: { type: "text", notNull: false, default: null },
        superset_group: { type: "uuid", notNull: false, default: null },
        sets: { type: "jsonb", notNull: true, default: "'[]'::jsonb" },
        created_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        updated_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        deleted_at: { type: "timestamp with time zone", notNull: false, default: null },
      },
      indexes: {
        workout_exercise_user_id_live_idx:
          "CREATE INDEX workout_exercise_user_id_live_idx ON public.workout_exercise USING btree (user_id) WHERE (deleted_at IS NULL)",
        workout_exercise_order_idx:
          'CREATE INDEX workout_exercise_order_idx ON public.workout_exercise USING btree (workout_id, "position", id) WHERE (deleted_at IS NULL)',
      },
    },
    program_slot: {
      columns: {
        id: { type: "uuid", notNull: true, default: null },
        user_id: { type: "text", notNull: true, default: null },
        program_id: { type: "uuid", notNull: true, default: null },
        workout_id: { type: "uuid", notNull: false, default: null },
        position: { type: "text", notNull: true, default: null },
        created_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        updated_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        deleted_at: { type: "timestamp with time zone", notNull: false, default: null },
      },
      indexes: {
        program_slot_user_id_live_idx:
          "CREATE INDEX program_slot_user_id_live_idx ON public.program_slot USING btree (user_id) WHERE (deleted_at IS NULL)",
        program_slot_order_idx:
          'CREATE INDEX program_slot_order_idx ON public.program_slot USING btree (program_id, "position", id) WHERE (deleted_at IS NULL)',
      },
    },
    training_session: {
      columns: {
        id: { type: "uuid", notNull: true, default: null },
        user_id: { type: "text", notNull: true, default: null },
        workout_id: { type: "uuid", notNull: false, default: null },
        program_id: { type: "uuid", notNull: false, default: null },
        run_id: { type: "uuid", notNull: false, default: null },
        slot_id: { type: "uuid", notNull: false, default: null },
        cycle: { type: "integer", notNull: false, default: null },
        title: { type: "text", notNull: true, default: null },
        title_derived: { type: "boolean", notNull: true, default: "true" },
        note: { type: "text", notNull: false, default: null },
        started_at: { type: "timestamp with time zone", notNull: true, default: null },
        finished_at: { type: "timestamp with time zone", notNull: false, default: null },
        duration_s: { type: "integer", notNull: false, default: null },
        device_id: { type: "uuid", notNull: true, default: null },
        rest_set_id: { type: "uuid", notNull: false, default: null },
        rest_started_at: { type: "timestamp with time zone", notNull: false, default: null },
        rest_ends_at: { type: "timestamp with time zone", notNull: false, default: null },
        created_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        updated_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        deleted_at: { type: "timestamp with time zone", notNull: false, default: null },
      },
      indexes: {
        session_user_id_live_idx:
          "CREATE INDEX session_user_id_live_idx ON public.training_session USING btree (user_id) WHERE (deleted_at IS NULL)",
        session_user_started_at_idx:
          "CREATE INDEX session_user_started_at_idx ON public.training_session USING btree (user_id, started_at DESC NULLS LAST)",
      },
    },
    session_exercise: {
      columns: {
        id: { type: "uuid", notNull: true, default: null },
        user_id: { type: "text", notNull: true, default: null },
        session_id: { type: "uuid", notNull: true, default: null },
        exercise_id: { type: "uuid", notNull: true, default: null },
        exercise_title: { type: "text", notNull: true, default: null },
        exercise_type: { type: "text", notNull: true, default: null },
        source_workout_exercise_id: { type: "uuid", notNull: false, default: null },
        position: { type: "text", notNull: true, default: null },
        rest_seconds: { type: "smallint", notNull: false, default: null },
        note: { type: "text", notNull: false, default: null },
        superset_group: { type: "uuid", notNull: false, default: null },
        log_effort: { type: "boolean", notNull: true, default: "false" },
        created_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        updated_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        deleted_at: { type: "timestamp with time zone", notNull: false, default: null },
      },
      indexes: {
        session_exercise_user_id_live_idx:
          "CREATE INDEX session_exercise_user_id_live_idx ON public.session_exercise USING btree (user_id) WHERE (deleted_at IS NULL)",
        session_exercise_order_idx:
          'CREATE INDEX session_exercise_order_idx ON public.session_exercise USING btree (session_id, "position", id) WHERE (deleted_at IS NULL)',
        session_exercise_exercise_id_idx:
          "CREATE INDEX session_exercise_exercise_id_idx ON public.session_exercise USING btree (exercise_id)",
      },
    },
    session_set: {
      columns: {
        id: { type: "uuid", notNull: true, default: null },
        user_id: { type: "text", notNull: true, default: null },
        session_exercise_id: { type: "uuid", notNull: true, default: null },
        position: { type: "text", notNull: true, default: null },
        kind: { type: "text", notNull: true, default: null },
        weight_kg: { type: "double precision", notNull: false, default: null },
        reps: { type: "integer", notNull: false, default: null },
        duration_s: { type: "integer", notNull: false, default: null },
        distance_m: { type: "double precision", notNull: false, default: null },
        floors: { type: "integer", notNull: false, default: null },
        steps: { type: "integer", notNull: false, default: null },
        rpe: { type: "double precision", notNull: false, default: null },
        completed_at: { type: "timestamp with time zone", notNull: false, default: null },
        timer_started_at: { type: "timestamp with time zone", notNull: false, default: null },
        target: { type: "jsonb", notNull: false, default: null },
        created_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        updated_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        deleted_at: { type: "timestamp with time zone", notNull: false, default: null },
      },
      indexes: {
        session_set_user_id_live_idx:
          "CREATE INDEX session_set_user_id_live_idx ON public.session_set USING btree (user_id) WHERE (deleted_at IS NULL)",
        session_set_order_idx:
          'CREATE INDEX session_set_order_idx ON public.session_set USING btree (session_exercise_id, "position", id) WHERE (deleted_at IS NULL)',
      },
    },
    gym_equipment: {
      columns: {
        id: { type: "uuid", notNull: true, default: null },
        user_id: { type: "text", notNull: true, default: null },
        kind: { type: "text", notNull: true, default: null },
        weight_kg: { type: "double precision", notNull: true, default: null },
        unit: { type: "text", notNull: true, default: null },
        label: { type: "text", notNull: false, default: null },
        count: { type: "integer", notNull: false, default: null },
        enabled: { type: "boolean", notNull: true, default: "true" },
        created_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        updated_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        deleted_at: { type: "timestamp with time zone", notNull: false, default: null },
      },
      indexes: {
        gym_equipment_user_id_live_idx:
          "CREATE INDEX gym_equipment_user_id_live_idx ON public.gym_equipment USING btree (user_id) WHERE (deleted_at IS NULL)",
      },
    },
    exercise_setting: {
      columns: {
        id: { type: "uuid", notNull: true, default: null },
        user_id: { type: "text", notNull: true, default: null },
        exercise_id: { type: "uuid", notNull: true, default: null },
        bar_id: { type: "uuid", notNull: false, default: null },
        log_effort: { type: "boolean", notNull: true, default: "false" },
        created_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        updated_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
        deleted_at: { type: "timestamp with time zone", notNull: false, default: null },
      },
      indexes: {
        exercise_setting_user_id_live_idx:
          "CREATE INDEX exercise_setting_user_id_live_idx ON public.exercise_setting USING btree (user_id) WHERE (deleted_at IS NULL)",
        exercise_setting_user_exercise_live_idx:
          "CREATE UNIQUE INDEX exercise_setting_user_exercise_live_idx ON public.exercise_setting USING btree (user_id, exercise_id) WHERE (deleted_at IS NULL)",
      },
    },
    // Server-only: never published, never streamed.
    reference_import: {
      columns: {
        catalog: { type: "text", notNull: true, default: null },
        fingerprint: { type: "text", notNull: true, default: null },
        imported_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
      },
      indexes: {},
    },
  },
  // Created by the test setup the way the bootstrap does, filled by the migrations.
  publications: {
    powersync: [
      "notes(id, user_id, title, body, created_at, updated_at, deleted_at)",
      "exercise(id, user_id, title, primary_muscle, secondary_muscles, equipment, exercise_type, is_full_bodyweight, rank, search_terms, aka, instructions, video_key, thumbnail_key, retired_at, created_at, updated_at)",
      "program(id, user_id, title, description, planned_weeks, cover_key, created_at, updated_at, deleted_at)",
      "workout(id, user_id, program_id, title, note, created_at, updated_at, deleted_at)",
      "workout_exercise(id, user_id, workout_id, exercise_id, position, rest_seconds, note, superset_group, sets, created_at, updated_at, deleted_at)",
      "program_slot(id, user_id, program_id, workout_id, position, created_at, updated_at, deleted_at)",
      "training_session(id, user_id, workout_id, program_id, run_id, slot_id, cycle, title, title_derived, note, started_at, finished_at, duration_s, device_id, rest_set_id, rest_started_at, rest_ends_at, created_at, updated_at, deleted_at)",
      "session_exercise(id, user_id, session_id, exercise_id, exercise_title, exercise_type, source_workout_exercise_id, position, rest_seconds, note, superset_group, log_effort, created_at, updated_at, deleted_at)",
      "session_set(id, user_id, session_exercise_id, position, kind, weight_kg, reps, duration_s, distance_m, floors, steps, rpe, completed_at, timer_started_at, target, created_at, updated_at, deleted_at)",
      "gym_equipment(id, user_id, kind, weight_kg, unit, label, count, enabled, created_at, updated_at, deleted_at)",
      "exercise_setting(id, user_id, exercise_id, bar_id, log_effort, created_at, updated_at, deleted_at)",
    ],
  },
};

describe("server schema parity", () => {
  it("matches the declared expectation, with the exercise table in the publication", async () => {
    expect(compareToExpectation(await introspectPostgres(client), expectation)).toEqual([]);
  });

  it("reports drift in columns, indexes and publication membership", async () => {
    const actual = await introspectPostgres(client);
    const drifted = structuredClone(expectation);
    const exercise = drifted.tables?.exercise;
    if (!exercise?.columns.equipment) throw new Error("fixture");
    exercise.columns.equipment.notNull = false;
    delete exercise.columns.title;
    exercise.indexes.missing_idx =
      "CREATE INDEX missing_idx ON public.exercise USING btree (title)";
    drifted.publications = { powersync: ["exercise(id)"] };
    const problems = compareToExpectation(actual, drifted).join("\n");
    expect(problems).toMatch(/exercise\.equipment is/);
    expect(problems).toContain("exercise.title is not declared");
    expect(problems).toContain("index missing_idx is missing");
    expect(problems).toContain("publication powersync has [exercise(id, user_id");
  });

  it("keeps every stream consistent with the table, the publication and the upload handlers", async () => {
    const config = readFileSync(
      new URL("../../../../../powersync/sync-config.yaml", import.meta.url),
      "utf8",
    );
    const streams = parseStreams(config);
    expect([...new Set(streams.map((stream) => stream.name))].sort()).toEqual([
      "exercise_catalog",
      "my_library",
      "my_training",
    ]);
    // my_training is one subscription over the plan tables and the session tables.
    expect(
      streams
        .filter((stream) => stream.name === "my_training")
        .map((stream) => stream.table)
        .sort(),
    ).toEqual([
      "exercise_setting",
      "gym_equipment",
      "program",
      "program_slot",
      "session_exercise",
      "session_set",
      "training_session",
      "workout",
      "workout_exercise",
    ]);
    const uploadTables = syncTableHandlers.map((handler) => handler.table);
    const actual = await introspectPostgres(client);
    expect(compareStreams(streams, actual, uploadTables)).toEqual([]);
  });

  it("reports a stream that drifted from the schema", async () => {
    const actual = await introspectPostgres(client);
    // The legacy notes table still has `deleted_at`, which is what the soft-delete rule checks.
    const streams = parseStreams(
      "streams:\n  bad:\n    query: SELECT id, nope FROM notes WHERE user_id = auth.user_id()\n  worse:\n    query: SELECT * FROM jwks WHERE true",
    );
    const problems = compareStreams(streams, actual, ["notes"]).join("\n");
    expect(problems).toContain("notes.nope, which does not exist");
    expect(problems).toContain("stream bad does not exclude soft-deleted rows");
    expect(problems).toContain("stream worse selects *");
    expect(problems).toContain("stream worse reads jwks, which is not in a publication");
    expect(problems).toContain("stream worse has no upload handler for jwks");
  });
});

describe("publication migrations", () => {
  it("fails closed when the bootstrap has not created the publication", async () => {
    const runId = `${inject("testRunId")}nopub`;
    await expect(
      createTemplate(runId, async (url) => {
        const connection = createDb(url);
        try {
          await runMigrations(connection);
        } finally {
          await connection.pool.end();
        }
      }),
    ).rejects.toThrow(/powersync/);
  });
});
