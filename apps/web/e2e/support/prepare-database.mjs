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
await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await client.query(`CREATE DATABASE ${name}`);
await client.end();
