import { log } from "@workspace/logger";
import { Client, type ClientConfig } from "pg";
import { z } from "zod";

/** Cluster-wide names PowerSync's access is provisioned under. Tests pass unique ones. */
export type BootstrapNames = {
  replicationRole: string;
  storageRole: string;
  storageDatabase: string;
  publication: string;
};

export const DEFAULT_BOOTSTRAP_NAMES = {
  replicationRole: "powersync_replication",
  storageRole: "powersync_storage",
  storageDatabase: "powersync_storage",
  publication: "powersync",
} as const satisfies BootstrapNames;

export const BOOTSTRAP_STEPS = [
  "preflight",
  "replication-role",
  "storage-role",
  "storage-database",
  "grants",
  "publication",
  "verify",
] as const;
export type BootstrapStep = (typeof BOOTSTRAP_STEPS)[number];

export type BootstrapOptions = {
  /** Admin connection to the application database (superuser, or CREATEROLE + CREATEDB + REPLICATION). */
  adminUrl: string;
  /** The runtime URL. Its user owns the publication and the synced tables. */
  databaseUrl: string;
  replicationPassword: string;
  storagePassword: string;
  /** In production a privileged application role fails preflight; elsewhere it only warns. */
  isProduction: boolean;
  names?: BootstrapNames;
  /** How long to wait for another bootstrap run to finish before giving up. */
  lockWaitMs?: number;
  /** Called after each step completes. Tests throw from it to simulate a crash. */
  onStep?: (step: BootstrapStep) => void | Promise<void>;
};

export type BootstrapResult = { completed: BootstrapStep[]; warnings: string[] };

/** Preflight found things that make a run unsafe. Messages hold names and settings, never secrets. */
export class BootstrapPreflightError extends Error {
  constructor(readonly problems: string[]) {
    super(`Sync bootstrap preflight failed:\n- ${problems.join("\n- ")}`);
    this.name = "BootstrapPreflightError";
  }
}

/** Advisory lock keys: two int4s so the lock is namespaced to this tool. */
const LOCK_KEYS = [0x70737963, 1] as const;
const MIN_POSTGRES_VERSION = 140_000;

function connection(url: string): ClientConfig {
  return { connectionString: url, connectionTimeoutMillis: 5_000 };
}

/** Postgres error code only: messages can quote statements that hold passwords. */
function failure(step: BootstrapStep, error: Error): Error {
  if (error instanceof BootstrapPreflightError) return error;
  const code = ("code" in error ? z.string().safeParse(error.code).data : undefined) ?? error.name;
  return new Error(`Sync bootstrap failed at step "${step}" (${code}).`);
}

/**
 * Provisions what PowerSync needs on the source Postgres: a replication role,
 * a storage database with its own role, the grants between them, and an empty
 * publication owned by the application role. Adding tables to the publication
 * belongs to each table's migration, so a rerun never touches its membership.
 *
 * Every step is idempotent and commits on its own (`CREATE DATABASE` cannot
 * share a transaction), so a run that dies halfway resumes by being run again.
 * An advisory lock serializes concurrent runs. Anything unexpected fails closed.
 */
export async function bootstrapReplication(options: BootstrapOptions): Promise<BootstrapResult> {
  const names = options.names ?? DEFAULT_BOOTSTRAP_NAMES;
  const admin = new Client(connection(options.adminUrl));
  const completed: BootstrapStep[] = [];
  let current: BootstrapStep = "preflight";
  const finish = async (step: BootstrapStep) => {
    completed.push(step);
    log.info({ action: "sync.bootstrap", step });
    await options.onStep?.(step);
  };

  await admin.connect().catch(() => {
    throw new Error("Sync bootstrap could not connect with the admin URL.");
  });
  try {
    await acquireLock(admin, options.lockWaitMs ?? 30_000);
    const appRole = decodeURIComponent(new URL(options.databaseUrl).username);
    const warnings = await preflight(admin, { ...options, names, appRole });
    await finish("preflight");

    current = "replication-role";
    await upsertRole(admin, names.replicationRole, options.replicationPassword, "REPLICATION");
    await finish(current);

    current = "storage-role";
    await upsertRole(admin, names.storageRole, options.storagePassword, "NOREPLICATION");
    await finish(current);

    current = "storage-database";
    await ensureStorageDatabase(admin, names);
    await finish(current);

    current = "grants";
    await grant(admin, names);
    await finish(current);

    current = "publication";
    await ensurePublication(admin, names.publication, appRole);
    await finish(current);

    current = "verify";
    await verifyLogins(options, names);
    await finish(current);

    return { completed, warnings };
  } catch (error) {
    throw failure(current, error instanceof Error ? error : new Error(String(error)));
  } finally {
    await admin.end().catch(() => undefined);
  }
}

async function acquireLock(admin: Client, waitMs: number) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const { rows } = await admin.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS locked",
      [...LOCK_KEYS],
    );
    if (rows[0]?.locked) return;
    if (Date.now() >= deadline) {
      throw new BootstrapPreflightError(["another bootstrap run holds the lock; try again"]);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

type PreflightInput = BootstrapOptions & { names: BootstrapNames; appRole: string };

async function preflight(admin: Client, input: PreflightInput): Promise<string[]> {
  const { names, appRole } = input;
  const problems: string[] = [];
  const warnings: string[] = [];

  const settings = (
    await admin.query<{
      version: number;
      wal_level: string;
      max_slots: number;
      max_senders: number;
    }>(
      `SELECT current_setting('server_version_num')::int AS version,
              current_setting('wal_level') AS wal_level,
              current_setting('max_replication_slots')::int AS max_slots,
              current_setting('max_wal_senders')::int AS max_senders`,
    )
  ).rows[0];
  if (!settings) throw new BootstrapPreflightError(["could not read server settings"]);
  if (settings.version < MIN_POSTGRES_VERSION) {
    problems.push(`Postgres ${settings.version} is older than supported (14+)`);
  }
  if (settings.wal_level !== "logical") {
    problems.push(`wal_level is "${settings.wal_level}", it must be "logical" (restart required)`);
  }
  // One slot for streaming plus one for snapshotting while a sync config is reprocessed.
  if (settings.max_slots < 2) problems.push("max_replication_slots must be at least 2");
  if (settings.max_senders < 2) problems.push("max_wal_senders must be at least 2");

  const roles = (
    await admin.query<{
      rolname: string;
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolreplication: boolean;
      is_admin: boolean;
    }>(
      `SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolreplication,
              rolname = current_user AS is_admin
         FROM pg_roles WHERE rolname = current_user OR rolname = ANY($1)`,
      [[appRole, names.replicationRole, names.storageRole]],
    )
  ).rows;
  const adminRole = roles.find((role) => role.is_admin);
  if (
    !adminRole ||
    !(
      adminRole.rolsuper ||
      (adminRole.rolcreaterole && adminRole.rolcreatedb && adminRole.rolreplication)
    )
  ) {
    problems.push("the admin role needs superuser, or CREATEROLE + CREATEDB + REPLICATION");
  }

  const app = roles.find((role) => role.rolname === appRole);
  if (!app) {
    problems.push(`application role "${appRole}" does not exist`);
  } else if (app.rolsuper || app.rolcreaterole || app.rolreplication) {
    const message = `application role "${appRole}" has superuser, CREATEROLE or REPLICATION`;
    if (input.isProduction) problems.push(`${message}; the runtime role must be unprivileged`);
    else warnings.push(`${message} (accepted outside production)`);
  }
  if (new Set([appRole, names.replicationRole, names.storageRole]).size !== 3) {
    problems.push("the application, replication and storage roles must be three different roles");
  }
  for (const role of roles.filter((r) =>
    [names.replicationRole, names.storageRole].includes(r.rolname),
  )) {
    if (role.rolsuper) problems.push(`role "${role.rolname}" exists as a superuser`);
  }

  const publication = (
    await admin.query<{ puballtables: boolean }>(
      "SELECT puballtables FROM pg_publication WHERE pubname = $1",
      [names.publication],
    )
  ).rows[0];
  if (publication?.puballtables) {
    problems.push(`publication "${names.publication}" is FOR ALL TABLES; refusing to adopt it`);
  }

  const storageOwner = (
    await admin.query<{ owner: string }>(
      "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1",
      [names.storageDatabase],
    )
  ).rows[0];
  if (storageOwner && storageOwner.owner !== names.storageRole) {
    problems.push(
      `database "${names.storageDatabase}" exists but is owned by "${storageOwner.owner}", not "${names.storageRole}"`,
    );
  }

  if (problems.length > 0) throw new BootstrapPreflightError(problems);
  return warnings;
}

async function upsertRole(admin: Client, role: string, password: string, replication: string) {
  const name = admin.escapeIdentifier(role);
  const exists = (await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role])).rowCount;
  const attributes = `LOGIN ${replication} NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${admin.escapeLiteral(password)}`;
  // ALTER on rerun also rotates the password when the environment changed.
  await admin.query(`${exists ? "ALTER" : "CREATE"} ROLE ${name} WITH ${attributes}`);
}

async function ensureStorageDatabase(admin: Client, names: BootstrapNames) {
  const exists = (
    await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [names.storageDatabase])
  ).rowCount;
  const database = admin.escapeIdentifier(names.storageDatabase);
  // A single statement outside any transaction block, as CREATE DATABASE requires.
  if (!exists) {
    await admin.query(
      `CREATE DATABASE ${database} OWNER ${admin.escapeIdentifier(names.storageRole)}`,
    );
  }
  await admin.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
  await admin.query(
    `GRANT CONNECT, TEMPORARY ON DATABASE ${database} TO ${admin.escapeIdentifier(names.storageRole)}`,
  );
}

async function grant(admin: Client, names: BootstrapNames) {
  const replication = admin.escapeIdentifier(names.replicationRole);
  const { rows } = await admin.query<{ database: string }>("SELECT current_database() AS database");
  const database = admin.escapeIdentifier(rows[0]?.database ?? "");
  await admin.query(`GRANT CONNECT ON DATABASE ${database} TO ${replication}`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${replication}`);
}

async function ensurePublication(admin: Client, publication: string, appRole: string) {
  const name = admin.escapeIdentifier(publication);
  const existing = (
    await admin.query<{ owner: string }>(
      "SELECT pg_get_userbyid(pubowner) AS owner FROM pg_publication WHERE pubname = $1",
      [publication],
    )
  ).rows[0];
  // Created empty and never altered here: table membership belongs to migrations.
  if (!existing) await admin.query(`CREATE PUBLICATION ${name}`);
  if (existing?.owner !== appRole) {
    await admin.query(`ALTER PUBLICATION ${name} OWNER TO ${admin.escapeIdentifier(appRole)}`);
  }
}

/** Logs in as the two new roles: a password, pg_hba or grant mistake fails here, not in PowerSync. */
async function verifyLogins(options: BootstrapOptions, names: BootstrapNames) {
  const adminUrl = new URL(options.adminUrl);
  const as = async (role: string, password: string, database: string, check: string) => {
    const url = new URL(adminUrl);
    url.username = role;
    url.password = password;
    url.pathname = `/${database}`;
    const client = new Client(connection(url.toString()));
    await client.connect();
    try {
      const { rows } = await client.query<{ ok: boolean }>(`SELECT ${check} AS ok`);
      if (!rows[0]?.ok) throw new BootstrapPreflightError([`role "${role}" lacks required access`]);
    } finally {
      await client.end().catch(() => undefined);
    }
  };
  const appDatabase = decodeURIComponent(adminUrl.pathname.replace(/^\//, ""));
  await as(
    names.replicationRole,
    options.replicationPassword,
    appDatabase,
    "(SELECT rolreplication FROM pg_roles WHERE rolname = current_user) AND has_schema_privilege(current_user, 'public', 'USAGE')",
  );
  await as(
    names.storageRole,
    options.storagePassword,
    names.storageDatabase,
    "has_schema_privilege(current_user, 'public', 'CREATE')",
  );
}
