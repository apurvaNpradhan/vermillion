// Server half of the schema parity test (ADR 0024). It introspects the real,
// migrated Postgres and compares it with a declared expectation. The client half
// (SQLite schema, installed indexes) joins in a later phase, against the same
// expectation definition.
import type { Client } from "pg";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const columnRow = z.object({
  table_name: z.string(),
  column_name: z.string(),
  data_type: z.string(),
  not_null: z.boolean(),
  default_expr: z.string().nullable(),
});
const indexRow = z.object({
  table_name: z.string(),
  index_name: z.string(),
  definition: z.string(),
});
const publicationRow = z.object({
  publication: z.string(),
  table_name: z.string(),
  columns: z.array(z.string()),
});

export type ColumnDefinition = { type: string; notNull: boolean; default: string | null };
export type TableDefinition = {
  columns: Record<string, ColumnDefinition>;
  /** Index name to its `CREATE INDEX` definition. */
  indexes: Record<string, string>;
};
export type PostgresSchema = {
  tables: Record<string, TableDefinition>;
  /** Publication name to `table(column, ...)` members. */
  publications: Record<string, string[]>;
};

/** Reads columns, types, nullability, defaults, indexes and publication membership. */
export async function introspectPostgres(client: Client): Promise<PostgresSchema> {
  const columns = await client.query(
    `SELECT c.relname AS table_name, a.attname AS column_name,
            format_type(a.atttypid, a.atttypmod) AS data_type,
            a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS default_expr
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid AND c.relkind = 'r'
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum`,
  );
  const indexes = await client.query(
    `SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
       FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname`,
  );
  const members = await client.query(
    `SELECT pubname AS publication, tablename AS table_name, attnames::text[] AS columns
       FROM pg_publication_tables ORDER BY 1, 2`,
  );
  const publications = await client.query("SELECT pubname FROM pg_publication");

  const definition: PostgresSchema = { tables: {}, publications: {} };
  const tableOf = (name: string) => (definition.tables[name] ??= { columns: {}, indexes: {} });
  for (const row of z.array(columnRow).parse(columns.rows)) {
    tableOf(row.table_name).columns[row.column_name] = {
      type: row.data_type,
      notNull: row.not_null,
      default: row.default_expr,
    };
  }
  for (const row of z.array(indexRow).parse(indexes.rows)) {
    tableOf(row.table_name).indexes[row.index_name] = row.definition;
  }
  for (const { pubname } of z.array(z.object({ pubname: z.string() })).parse(publications.rows)) {
    definition.publications[pubname] = [];
  }
  for (const row of z.array(publicationRow).parse(members.rows)) {
    (definition.publications[row.publication] ??= []).push(
      `${row.table_name}(${row.columns.join(", ")})`,
    );
  }
  return definition;
}

export type Expectation = {
  /** Tables the expectation covers; others are ignored until declared. */
  tables?: Record<string, TableDefinition>;
  /** Exact publication membership; every publication that exists must be listed. */
  publications: Record<string, string[]>;
};

const syncConfigSchema = z.object({
  streams: z.record(
    z.string(),
    z.union([z.object({ query: z.string() }), z.object({ queries: z.array(z.string()).min(1) })]),
  ),
});
const streamQuery = /^\s*SELECT\s+(?<columns>[\w\s,*]+?)\s+FROM\s+(?<table>\w+)\s+WHERE\s/i;

export type StreamDefinition = { name: string; table: string; columns: string[]; query: string };

/**
 * The streams of a sync config as a table plus explicit columns. A query shape this does
 * not understand throws: streams stay simple enough to be checked (ADR 0019).
 */
export function parseStreams(configYaml: string): StreamDefinition[] {
  const config = syncConfigSchema.parse(parseYaml(configYaml));
  const streams: StreamDefinition[] = [];
  for (const [name, stream] of Object.entries(config.streams)) {
    // A stream with `queries` is one subscription over several tables: one definition per query.
    for (const query of "query" in stream ? [stream.query] : stream.queries) {
      const match = streamQuery.exec(query);
      if (!match?.groups?.columns || !match.groups.table) {
        throw new Error(`stream ${name}: expected "SELECT <columns> FROM <table> WHERE ..."`);
      }
      streams.push({
        name,
        table: match.groups.table,
        columns: match.groups.columns.split(",").map((column) => column.trim()),
        query,
      });
    }
  }
  return streams;
}

/** Differences between the streams and the migrated tables, publication and upload handlers. */
export function compareStreams(
  streams: readonly StreamDefinition[],
  actual: PostgresSchema,
  uploadTables: readonly string[],
): string[] {
  const problems: string[] = [];
  const published = new Set(
    Object.values(actual.publications)
      .flat()
      .map((member) => member.split("(")[0]),
  );
  for (const stream of streams) {
    const { name } = stream;
    const table = actual.tables[stream.table];
    if (!table) {
      problems.push(`stream ${name} reads missing table ${stream.table}`);
      continue;
    }
    for (const column of stream.columns) {
      if (column === "*") problems.push(`stream ${name} selects *`);
      else if (!table.columns[column])
        problems.push(`stream ${name} selects ${stream.table}.${column}, which does not exist`);
    }
    if (!published.has(stream.table))
      problems.push(`stream ${name} reads ${stream.table}, which is not in a publication`);
    // A stream is per user, or the catalog's global one (`user_id IS NULL`: Reference data).
    if (
      !/\buser_id\s*=\s*auth\.user_id\(\)/i.test(stream.query) &&
      !/\buser_id\s+IS\s+NULL\b/i.test(stream.query)
    )
      problems.push(
        `stream ${name} is not filtered by user_id = auth.user_id() or user_id IS NULL`,
      );
    if (table.columns.deleted_at && !/\bdeleted_at\s+IS\s+NULL\b/i.test(stream.query))
      problems.push(`stream ${name} does not exclude soft-deleted rows`);
    if (!uploadTables.includes(stream.table))
      problems.push(`stream ${name} has no upload handler for ${stream.table}`);
  }
  return problems;
}

/** Human-readable differences between the database and the declaration; empty means parity. */
export function compareToExpectation(actual: PostgresSchema, expected: Expectation): string[] {
  const problems: string[] = [];
  for (const [name, table] of Object.entries(expected.tables ?? {})) {
    const found = actual.tables[name];
    if (!found) {
      problems.push(`table ${name} is missing`);
      continue;
    }
    for (const [column, definition] of Object.entries(table.columns)) {
      const have = found.columns[column];
      if (!have) problems.push(`${name}.${column} is missing`);
      else if (JSON.stringify(have) !== JSON.stringify(definition))
        problems.push(
          `${name}.${column} is ${JSON.stringify(have)}, expected ${JSON.stringify(definition)}`,
        );
    }
    for (const column of Object.keys(found.columns)) {
      if (!(column in table.columns)) problems.push(`${name}.${column} is not declared`);
    }
    for (const [index, definition] of Object.entries(table.indexes)) {
      if (found.indexes[index] !== definition)
        problems.push(`${name} index ${index} is ${found.indexes[index] ?? "missing"}`);
    }
  }
  const names = new Set([
    ...Object.keys(actual.publications),
    ...Object.keys(expected.publications),
  ]);
  for (const name of names) {
    const have = [...(actual.publications[name] ?? [])].sort();
    const want = [...(expected.publications[name] ?? [])].sort();
    if (have.join("|") !== want.join("|"))
      problems.push(`publication ${name} has [${have.join(", ")}], expected [${want.join(", ")}]`);
  }
  return problems;
}
