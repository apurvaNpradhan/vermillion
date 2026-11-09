import { inspect } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { prepareDatabaseStartup } from "./prepare-database-startup";

const databaseUrl = "postgresql://app:s3cret-pass@postgres:5432/app";

describe("database startup", () => {
  // Diagnosis (review F19): the child is CPU-bound, not waiting on anything. Run alone it
  // takes ~1.9 s, of which ~1.5 s is tsx transpiling and loading the server's whole static
  // import graph (react-email, prismjs, better-auth, ...) before the DATABASE_URL check
  // fails; going through `pnpm --filter server exec` added another ~0.7 s of pnpm startup.
  // Twelve copies at once took 13.5 s each on this machine, so a busy full-suite run
  // exceeded the old 10 s limit with nothing wrong. The fix: start tsx directly (no pnpm)
  // and give the child a budget that covers a contended CPU, still far below a hang.
  it(
    "keeps malformed credentials out of the executable's stdout and stderr",
    { timeout: 90_000 },
    () => {
      const result = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts"], {
        cwd: fileURLToPath(new URL("../../../../../apps/server/", import.meta.url)),
        env: {
          ...process.env,
          NODE_ENV: "development",
          APP_URL: "http://localhost:3000",
          BETTER_AUTH_SECRET: "test-secret-0123456789abcdefghijklmnopqrstuvwxyz",
          DATABASE_URL: "postgresql://app:startup-private-password@db:invalid/app", // secret-scan:allow
        },
        encoding: "utf8",
        timeout: 60_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain("Invalid DATABASE_URL");
      expect(output).not.toContain("startup-private-password");
    },
  );
  it.each([
    "postgresql://app:s3cret-pass@db:invalid/app", // secret-scan:allow
    "not-a-url-s3cret-pass",
  ])("never exposes malformed connection input: %s", async (invalid) => {
    const failure = await prepareDatabaseStartup({
      databaseUrl: invalid,
      waitForDatabase: async () => undefined,
      runStartupMigrations: async () => undefined,
    }).catch((error: Error) => error);
    expect(inspect(failure)).not.toContain("s3cret-pass");
    expect(inspect(failure)).toContain("Invalid DATABASE_URL");
  });

  it("does not expose driver errors through an uncaught cause", async () => {
    const failure = await prepareDatabaseStartup({
      databaseUrl,
      waitForDatabase: async () => {
        throw new Error(databaseUrl);
      },
      runStartupMigrations: async () => undefined,
      logError: () => undefined,
    }).catch((error: Error) => error);
    expect(inspect(failure)).not.toContain("s3cret-pass");
  });

  it("waits for the database before running migrations", async () => {
    const events: string[] = [];
    await prepareDatabaseStartup({
      databaseUrl,
      waitForDatabase: async () => void events.push("wait"),
      runStartupMigrations: async () => void events.push("migrate"),
      logInfo: () => void events.push("log"),
    });
    expect(events).toEqual(["log", "wait", "migrate"]);
  });

  it("skips migrations and names the target, without the password, when the database is unreachable", async () => {
    const runStartupMigrations = vi.fn();
    const logError = vi.fn();
    const failure = await prepareDatabaseStartup({
      databaseUrl,
      waitForDatabase: async () => {
        throw new Error("getaddrinfo EAI_AGAIN postgres");
      },
      runStartupMigrations,
      logError,
    }).catch((error: Error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("postgres:5432/app");
    expect((failure as Error).message).not.toContain("s3cret-pass");
    expect(runStartupMigrations).not.toHaveBeenCalled();
    expect(JSON.stringify(logError.mock.calls)).not.toContain("s3cret-pass");
  });

  it("reports migration failures separately from readiness failures", async () => {
    await expect(
      prepareDatabaseStartup({
        databaseUrl,
        waitForDatabase: async () => undefined,
        runStartupMigrations: async () => {
          throw new Error("permission denied for schema public");
        },
        logError: () => undefined,
      }),
    ).rejects.toThrow("Database migrations failed for postgres:5432/app.");
  });

  it("never logs the password on the default log path", async () => {
    const seen: string[] = [];
    const spy = vi
      .spyOn(console, "log")
      .mockImplementation((...args) => void seen.push(args.join(" ")));
    const info = vi
      .spyOn(console, "info")
      .mockImplementation((...args) => void seen.push(args.join(" ")));
    await prepareDatabaseStartup({
      databaseUrl,
      waitForDatabase: async () => undefined,
      runStartupMigrations: async () => undefined,
    });
    spy.mockRestore();
    info.mockRestore();
    expect(seen.join("\n")).not.toContain("s3cret-pass");
  });
});
