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
  },
  // Created by the test setup the way the bootstrap does, filled by the notes migration.
  publications: {
    powersync: ["notes(id, user_id, title, body, created_at, updated_at, deleted_at)"],
  },
};

describe("server schema parity", () => {
  it("matches the declared expectation, with notes in the publication", async () => {
    expect(compareToExpectation(await introspectPostgres(client), expectation)).toEqual([]);
  });

  it("reports drift in columns, indexes and publication membership", async () => {
    const actual = await introspectPostgres(client);
    const drifted = structuredClone(expectation);
    const notes = drifted.tables?.notes;
    if (!notes?.columns.body) throw new Error("fixture");
    notes.columns.body.notNull = false;
    delete notes.columns.title;
    notes.indexes.missing_idx = "CREATE INDEX missing_idx ON public.notes USING btree (title)";
    drifted.publications = { powersync: ["notes(id)"] };
    const problems = compareToExpectation(actual, drifted).join("\n");
    expect(problems).toMatch(/notes\.body is/);
    expect(problems).toContain("notes.title is not declared");
    expect(problems).toContain("index missing_idx is missing");
    expect(problems).toContain("publication powersync has [notes(id, user_id");
  });

  it("keeps every stream consistent with the table, the publication and the upload handlers", async () => {
    const config = readFileSync(
      new URL("../../../../../powersync/sync-config.yaml", import.meta.url),
      "utf8",
    );
    const streams = parseStreams(config);
    expect(streams.map((stream) => stream.name)).toContain("notes");
    const uploadTables = syncTableHandlers.map((handler) => handler.table);
    const actual = await introspectPostgres(client);
    expect(compareStreams(streams, actual, uploadTables)).toEqual([]);
  });

  it("reports a stream that drifted from the schema", async () => {
    const actual = await introspectPostgres(client);
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

describe("notes publication migration", () => {
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
