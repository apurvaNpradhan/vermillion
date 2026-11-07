// Real-Postgres plumbing for tests (ADR 0024): one migrated template database per
// run, one clone per test file or app, explicit cleanup. Test-only environment
// overrides are read from `process.env` here, the documented exemption in
// .agents/testing.md.
import { randomBytes } from "node:crypto";
import { Client } from "pg";

const DEFAULT_ADMIN_URL = "postgresql://postgres:password@127.0.0.1:5432/postgres";

/** Connection with rights to create databases; `SYNC_INFRA_TEST_ADMIN_URL` is the older name. */
export function adminUrl(): string {
  return (
    process.env.TEST_DATABASE_ADMIN_URL ??
    process.env.SYNC_INFRA_TEST_ADMIN_URL ??
    DEFAULT_ADMIN_URL
  );
}

export function urlForDatabase(database: string): string {
  const url = new URL(adminUrl());
  url.pathname = `/${database}`;
  return url.toString();
}

/** Names are interpolated into DDL, so only names we generated ourselves are accepted. */
function assertGeneratedName(name: string) {
  if (!/^vermillion_test_[a-z0-9_]+$/.test(name)) throw new Error("Unexpected test database name");
}

export class PostgresUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `Tests need the Docker Postgres at ${new URL(adminUrl()).host}: ${reason}\n` +
        "Start it with `pnpm db:start`, or point TEST_DATABASE_ADMIN_URL at a Postgres with CREATEDB rights.",
    );
    this.name = "PostgresUnavailableError";
  }
}

/** Connects to the admin database or throws a message that says what to do. */
export async function connectAdmin(): Promise<Client> {
  const client = new Client({ connectionString: adminUrl(), connectionTimeoutMillis: 3_000 });
  client.on("error", () => undefined);
  try {
    await client.connect();
  } catch (error) {
    await client.end().catch(() => undefined);
    throw new PostgresUnavailableError(
      error instanceof Error ? error.message : "connection failed",
    );
  }
  return client;
}

async function withAdmin<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = await connectAdmin();
  try {
    return await run(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function newRunId(): string {
  return randomBytes(4).toString("hex");
}

export async function dropDatabase(name: string): Promise<void> {
  assertGeneratedName(name);
  await withAdmin(async (client) => {
    // A logical slot pins its database: drop slots first, then force the database away.
    const { rows } = await client.query<{ slot_name: string }>(
      "SELECT slot_name FROM pg_replication_slots WHERE database = $1",
      [name],
    );
    for (const { slot_name } of rows) {
      await client.query("SELECT pg_drop_replication_slot($1)", [slot_name]).catch(() => undefined);
    }
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  });
}

/** Creates an empty database, lets `migrate` fill it, and returns its name as the template. */
export async function createTemplate(
  runId: string,
  migrate: (url: string) => Promise<void>,
): Promise<string> {
  const name = `vermillion_test_tpl_${runId}`;
  await withAdmin((client) => client.query(`CREATE DATABASE "${name}"`));
  try {
    await migrate(urlForDatabase(name));
  } catch (error) {
    await dropDatabase(name).catch(() => undefined);
    throw error;
  }
  return name;
}

let cloneCounter = 0;

/**
 * Clones the template for one test file or app. Postgres refuses to copy a
 * template while anything is connected to it, so nothing may connect to it
 * after setup.
 */
export async function cloneDatabase(template: string, runId: string): Promise<string> {
  assertGeneratedName(template);
  cloneCounter += 1;
  const name = `vermillion_test_${runId}_${process.pid}_${cloneCounter}_${randomBytes(2).toString("hex")}`;
  await withAdmin(async (client) => {
    // Concurrent clones of one template can briefly contend (55006); retry rather than fail.
    for (let attempt = 0; ; attempt += 1) {
      try {
        await client.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
        return;
      } catch (error) {
        const busy = error instanceof Error && "code" in error && error.code === "55006";
        if (!busy || attempt >= 40) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100 + attempt * 25));
      }
    }
  });
  return name;
}
