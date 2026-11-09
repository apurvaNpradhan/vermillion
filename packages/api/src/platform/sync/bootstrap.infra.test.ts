// Real-Postgres tests of the replication bootstrap (ADR 0023). Run with
// `pnpm test:sync-infra` against the compose Postgres (`pnpm db:start`). Without
// a reachable Postgres they skip with a message instead of failing, so
// `pnpm test` keeps working without Docker.
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BOOTSTRAP_STEPS,
  bootstrapReplication,
  BootstrapPreflightError,
  type BootstrapNames,
  type BootstrapOptions,
  type BootstrapStep,
} from "./bootstrap";

const ADMIN_URL =
  process.env.SYNC_INFRA_TEST_ADMIN_URL ?? "postgresql://postgres:password@localhost:5432/postgres";

async function probe(): Promise<string | undefined> {
  const client = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2_000 });
  try {
    await client.connect();
    const { rows } = await client.query<{ wal_level: string }>(
      "SELECT current_setting('wal_level') AS wal_level",
    );
    return rows[0]?.wal_level === "logical"
      ? undefined
      : `wal_level is ${rows[0]?.wal_level}; start the compose Postgres with pnpm db:start`;
  } catch {
    return `no Postgres at ${new URL(ADMIN_URL).host}; start it with pnpm db:start`;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const unavailable = await probe();
if (unavailable) process.stderr.write(`\nSKIPPED sync infra tests: ${unavailable}\n`);

const suffix = randomBytes(4).toString("hex");
const names: BootstrapNames = {
  replicationRole: `ps_test_repl_${suffix}`,
  storageRole: `ps_test_store_${suffix}`,
  storageDatabase: `ps_test_storage_${suffix}`,
  publication: `ps_test_pub_${suffix}`,
};
const appRole = `ps_test_app_${suffix}`;
const appDatabase = `ps_test_app_${suffix}`;
const REPLICATION_PASSWORD = `repl-${suffix}-0123456789`;
const STORAGE_PASSWORD = `store-${suffix}-0123456789`;

const urlFor = (user: string, password: string, database: string) => {
  const url = new URL(ADMIN_URL);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
};

function options(overrides: Partial<BootstrapOptions> = {}): BootstrapOptions {
  return {
    adminUrl: urlFor("postgres", new URL(ADMIN_URL).password, appDatabase),
    databaseUrl: urlFor(appRole, "app-password", appDatabase),
    replicationPassword: REPLICATION_PASSWORD,
    storagePassword: STORAGE_PASSWORD,
    isProduction: false,
    names,
    lockWaitMs: 5_000,
    ...overrides,
  };
}

async function withAdmin<T>(database: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: urlFor("postgres", new URL(ADMIN_URL).password, database),
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

const exists = (client: Client, query: string, value: string) =>
  client.query(query, [value]).then((result) => (result.rowCount ?? 0) > 0);

async function dropEverything() {
  await withAdmin("postgres", async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${names.storageDatabase}" WITH (FORCE)`);
    await client.query(`DROP DATABASE IF EXISTS "${appDatabase}" WITH (FORCE)`);
    await client.query(`DROP ROLE IF EXISTS "${names.replicationRole}"`);
    await client.query(`DROP ROLE IF EXISTS "${names.storageRole}"`);
    await client.query(`DROP ROLE IF EXISTS "${appRole}"`);
  });
}

/** The two things a rerun must never reset: table membership and the publication's owner. */
const publicationState = () =>
  withAdmin(appDatabase, async (client) => ({
    tables: (
      await client.query<{ tablename: string }>(
        "SELECT tablename FROM pg_publication_tables WHERE pubname = $1 ORDER BY 1",
        [names.publication],
      )
    ).rows.map((row) => row.tablename),
    owner: (
      await client.query<{ owner: string }>(
        "SELECT pg_get_userbyid(pubowner) AS owner FROM pg_publication WHERE pubname = $1",
        [names.publication],
      )
    ).rows[0]?.owner,
  }));

async function resetFixture() {
  await dropEverything();
  await withAdmin("postgres", async (client) => {
    await client.query(`CREATE ROLE "${appRole}" LOGIN PASSWORD 'app-password'`);
    await client.query(`CREATE DATABASE "${appDatabase}" OWNER "${appRole}"`);
  });
}

describe.skipIf(unavailable)("replication bootstrap on the compose Postgres", () => {
  beforeAll(async () => {
    await resetFixture();
  });
  afterAll(async () => {
    await dropEverything();
  });

  it("boots clean: roles, storage database, grants and an empty publication owned by the app role", async () => {
    await resetFixture();
    const result = await bootstrapReplication(options());

    expect(result.completed).toEqual([...BOOTSTRAP_STEPS]);
    await withAdmin(appDatabase, async (client) => {
      const role = await client.query<{ rolreplication: boolean; rolsuper: boolean }>(
        "SELECT rolreplication, rolsuper FROM pg_roles WHERE rolname = $1",
        [names.replicationRole],
      );
      expect(role.rows[0]).toEqual({ rolreplication: true, rolsuper: false });
      expect(
        await exists(client, "SELECT 1 FROM pg_database WHERE datname = $1", names.storageDatabase),
      ).toBe(true);
    });
    expect(await publicationState()).toEqual({ tables: [], owner: appRole });

    // The new roles really log in with the configured passwords.
    for (const [user, password, database] of [
      [names.replicationRole, REPLICATION_PASSWORD, appDatabase],
      [names.storageRole, STORAGE_PASSWORD, names.storageDatabase],
    ] as const) {
      const client = new Client({ connectionString: urlFor(user, password, database) });
      await client.connect();
      await client.end();
    }
  });

  it("repeat boot changes nothing and keeps the publication's tables", async () => {
    await resetFixture();
    await bootstrapReplication(options());
    // What a table's migration does (ADR 0023): the app role adds it and grants SELECT.
    const app = new Client({ connectionString: urlFor(appRole, "app-password", appDatabase) });
    await app.connect();
    await app.query("CREATE TABLE synced_rows (id text PRIMARY KEY)");
    await app.query(`ALTER PUBLICATION "${names.publication}" ADD TABLE synced_rows`);
    await app.query(`GRANT SELECT ON synced_rows TO "${names.replicationRole}"`);
    await app.end();
    const before = await publicationState();
    expect(before.tables).toEqual(["synced_rows"]);

    const again = await bootstrapReplication(options());

    expect(again.completed).toEqual([...BOOTSTRAP_STEPS]);
    expect(await publicationState()).toEqual(before);
  });

  it("recovers from a crash after the storage database was created", async () => {
    await resetFixture();
    const crash = new Error("injected crash");
    await expect(
      bootstrapReplication(
        options({
          onStep: (step: BootstrapStep) => {
            if (step === "storage-database") throw crash;
          },
        }),
      ),
    ).rejects.toThrow(/storage-database/);

    // The crash left roles and the storage database, but no grants and no publication.
    await withAdmin(appDatabase, async (client) => {
      expect(
        await exists(client, "SELECT 1 FROM pg_database WHERE datname = $1", names.storageDatabase),
      ).toBe(true);
      expect(
        await exists(client, "SELECT 1 FROM pg_publication WHERE pubname = $1", names.publication),
      ).toBe(false);
    });

    const resumed = await bootstrapReplication(options());

    expect(resumed.completed).toEqual([...BOOTSTRAP_STEPS]);
    expect(await publicationState()).toEqual({ tables: [], owner: appRole });
  });

  it("recovers from a crash after every step", async () => {
    for (const crashAfter of BOOTSTRAP_STEPS.slice(0, -1)) {
      await resetFixture();
      await expect(
        bootstrapReplication(
          options({
            onStep: (step: BootstrapStep) => {
              if (step === crashAfter) throw new Error("injected crash");
            },
          }),
        ),
      ).rejects.toThrow();
      const resumed = await bootstrapReplication(options());
      expect(resumed.completed).toEqual([...BOOTSTRAP_STEPS]);
    }
  });

  it("serializes concurrent runs", async () => {
    await resetFixture();
    const results = await Promise.all([
      bootstrapReplication(options()),
      bootstrapReplication(options()),
      bootstrapReplication(options()),
    ]);
    expect(results.map((result) => result.completed.length)).toEqual([7, 7, 7]);
    expect(await publicationState()).toEqual({ tables: [], owner: appRole });
  });

  it("rotates the role passwords on a rerun", async () => {
    await resetFixture();
    await bootstrapReplication(options());
    await bootstrapReplication(options({ replicationPassword: `rotated-${suffix}-0123456789` }));
    const client = new Client({
      connectionString: urlFor(names.replicationRole, `rotated-${suffix}-0123456789`, appDatabase),
    });
    await client.connect();
    await client.end();
  });

  it("fails closed on a FOR ALL TABLES publication and leaves it alone", async () => {
    await resetFixture();
    await withAdmin(appDatabase, (client) =>
      client.query(`CREATE PUBLICATION "${names.publication}" FOR ALL TABLES`),
    );
    const failure = await bootstrapReplication(options()).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(BootstrapPreflightError);
    expect(String(failure)).toContain("FOR ALL TABLES");
    await withAdmin(appDatabase, async (client) => {
      expect(
        await exists(client, "SELECT 1 FROM pg_roles WHERE rolname = $1", names.replicationRole),
      ).toBe(false);
    });
  });

  it("refuses an unprivileged application role only in production", async () => {
    await resetFixture();
    await withAdmin("postgres", (client) => client.query(`ALTER ROLE "${appRole}" CREATEROLE`));
    const development = await bootstrapReplication(options());
    expect(development.warnings.join()).toContain(appRole);

    await expect(bootstrapReplication(options({ isProduction: true }))).rejects.toThrow(
      /must be unprivileged/,
    );
  });

  it("never puts a password in an error", async () => {
    await resetFixture();
    const failure = await bootstrapReplication(
      options({ adminUrl: urlFor("postgres", "wrong-admin-password", appDatabase) }),
    ).catch((error: Error) => error);
    expect(String(failure)).not.toContain("wrong-admin-password");
    expect(String(failure)).not.toContain(REPLICATION_PASSWORD);
  });

  it("refuses a storage database owned by someone else", async () => {
    await resetFixture();
    await withAdmin("postgres", (client) =>
      client.query(`CREATE DATABASE "${names.storageDatabase}" OWNER "${appRole}"`),
    );
    const failure = await bootstrapReplication(options()).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(BootstrapPreflightError);
    expect(String(failure)).toContain(`owned by "${appRole}"`);
  });

  it("refuses an existing replication role that is a superuser", async () => {
    await resetFixture();
    await withAdmin("postgres", (client) =>
      client.query(`CREATE ROLE "${names.replicationRole}" LOGIN SUPERUSER`),
    );
    const failure = await bootstrapReplication(options()).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(BootstrapPreflightError);
    expect(String(failure)).toContain("exists as a superuser");
  });

  it("refuses an application role without CREATE on the database", async () => {
    await resetFixture();
    await withAdmin("postgres", async (client) => {
      await client.query(`ALTER DATABASE "${appDatabase}" OWNER TO postgres`);
      await client.query(`REVOKE CREATE ON DATABASE "${appDatabase}" FROM "${appRole}"`);
    });
    const failure = await bootstrapReplication(options()).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(BootstrapPreflightError);
    expect(String(failure)).toContain("needs CREATE on the database");
  });

  it("excludes runs against different databases of one cluster", async () => {
    await resetFixture();
    const otherDatabase = `${appDatabase}_b`;
    await withAdmin("postgres", (client) =>
      client.query(`CREATE DATABASE "${otherDatabase}" OWNER "${appRole}"`),
    );
    try {
      // Same cluster-wide roles and storage database from two databases at once.
      const results = await Promise.all([
        bootstrapReplication(options()),
        bootstrapReplication(
          options({
            adminUrl: urlFor("postgres", new URL(ADMIN_URL).password, otherDatabase),
            databaseUrl: urlFor(appRole, "app-password", otherDatabase),
          }),
        ),
      ]);
      expect(results.map((result) => result.completed.length)).toEqual([7, 7]);
    } finally {
      await withAdmin("postgres", (client) =>
        client.query(`DROP DATABASE IF EXISTS "${otherDatabase}" WITH (FORCE)`),
      );
    }
  });
});
