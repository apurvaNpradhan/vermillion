// Drops and recreates the end-to-end database so every run starts empty.
// The API server applies its migrations when it starts.
import { mkdirSync } from "node:fs";

import pg from "pg";

mkdirSync(new URL("../.artifacts", import.meta.url), { recursive: true });

const target = new URL(process.env.E2E_DATABASE_URL ?? "");
const name = target.pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Unsafe database name: ${name}`);

const admin = new URL(target);
admin.pathname = "/postgres";
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
const wal = await client.query("SHOW wal_level");
if (wal.rows[0]?.wal_level !== "logical") {
  await client.end();
  throw new Error("Browser sync tests need logical WAL. Start Postgres with pnpm db:start.");
}
await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await client.query(`CREATE DATABASE ${name}`);
// Separate bucket storage prevents a previous run (or the dev service) supplying checkpoints.
await client.query(`DROP DATABASE IF EXISTS ${name}_powersync WITH (FORCE)`);
await client.query(`CREATE DATABASE ${name}_powersync`);
// What the sync bootstrap provides before the notes publication migration runs (ADR 0023),
// as in the API test harness: the replication role (without LOGIN if missing) and the publication.
const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'powersync_replication'");
if (!role.rowCount) await client.query("CREATE ROLE powersync_replication NOLOGIN");
await client.end();

const database = new pg.Client({ connectionString: target.toString() });
await database.connect();
await database.query("CREATE PUBLICATION powersync");
await database.end();
