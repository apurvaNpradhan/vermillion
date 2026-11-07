import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { cloneDatabase, dropDatabase, urlForDatabase } from "../testing/postgres";
import { compareToExpectation, introspectPostgres, type Expectation } from "./parity";

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
 * nullability, defaults, indexes and publication membership. The migrated template has
 * no publication (the bootstrap creates it, empty, in the dev database), so none is expected.
 */
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
      },
      indexes: {
        notes_user_id_updated_at_idx:
          "CREATE INDEX notes_user_id_updated_at_idx ON public.notes USING btree (user_id, updated_at)",
      },
    },
  },
  publications: {},
};

describe("server schema parity", () => {
  it("matches the declared expectation, with an empty publication", async () => {
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
    expect(problems).toContain("publication powersync has []");
  });
});
