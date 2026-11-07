// Service locations for seam 3. Test-only overrides are read straight from
// `process.env` (the documented exemption in .agents/testing.md).
import { Client } from "pg";

export const services = {
  postgresUrl:
    process.env.SYNC_TEST_DATABASE_URL ??
    process.env.SYNC_INFRA_TEST_ADMIN_URL ??
    "postgresql://postgres:password@127.0.0.1:5432/vermillion",
  powersyncUrl: process.env.SYNC_TEST_POWERSYNC_URL ?? "http://127.0.0.1:8090",
  apiUrl: process.env.SYNC_TEST_API_URL ?? "http://127.0.0.1:3000",
  /** The origin the API trusts for browser-style requests (its `APP_URL`). */
  appOrigin: process.env.SYNC_TEST_APP_ORIGIN ?? "http://localhost:3001",
};

export type Problem = { service: string; message: string; fix: string };

async function postgres(): Promise<Problem | undefined> {
  const client = new Client({
    connectionString: services.postgresUrl,
    connectionTimeoutMillis: 3_000,
  });
  client.on("error", () => undefined);
  try {
    await client.connect();
    const { rows } = await client.query<{ wal_level: string }>(
      "SELECT current_setting('wal_level') AS wal_level",
    );
    if (rows[0]?.wal_level !== "logical") {
      return {
        service: "Postgres",
        message: `wal_level is ${rows[0]?.wal_level}, PowerSync needs logical`,
        fix: "recreate the compose Postgres with `pnpm db:start`",
      };
    }
    return undefined;
  } catch (error) {
    return {
      service: "Postgres",
      message: `cannot connect to ${new URL(services.postgresUrl).host} (${error instanceof Error ? error.message : "unknown error"})`,
      fix: "run `pnpm db:start`",
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function http(
  service: string,
  url: string,
  fix: string,
  ready: (body: string) => boolean,
): Promise<Problem | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    const body = await response.text();
    if (response.ok && ready(body)) return undefined;
    return { service, message: `${url} answered ${response.status}: ${body.slice(0, 120)}`, fix };
  } catch (error) {
    return {
      service,
      message: `cannot reach ${url} (${error instanceof Error ? error.message : "unknown error"})`,
      fix,
    };
  }
}

/** Everything seam 3 needs that is not started by the test itself; empty means ready. */
export async function checkPrerequisites(): Promise<Problem[]> {
  const found = await Promise.all([
    postgres(),
    http(
      "PowerSync",
      `${services.powersyncUrl}/probes/readiness`,
      "run `pnpm db:start` (PowerSync listens on 127.0.0.1:8090)",
      (body) => body.includes('"ready":true'),
    ),
    http(
      "API",
      `${services.apiUrl}/api/health`,
      "run `pnpm dev:server` (PowerSync fetches its JWKS from the API on port 3000)",
      () => true,
    ),
  ]);
  return found.filter((problem) => problem !== undefined);
}

export function describeProblems(problems: Problem[]): string {
  return [
    "Sync tests need the local stack:",
    ...problems.map((p) => `  - ${p.service}: ${p.message}\n    fix: ${p.fix}`),
  ].join("\n");
}
