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
    expect(streams.map((stream) => stream.name).sort()).toEqual(["exercise_catalog", "my_library"]);
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
