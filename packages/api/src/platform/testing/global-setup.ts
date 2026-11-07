// Vitest global setup: migrates a template database once per run (through the
// production migrator, advisory lock included) and drops it afterwards.
import { createDb } from "@workspace/db";
import { runMigrations } from "@workspace/db/migrator";
import type { TestProject } from "vitest/node";

import { createTemplate, dropDatabase, newRunId, provisionReplicationFixture } from "./postgres";

declare module "vitest" {
  export interface ProvidedContext {
    testRunId: string;
    testTemplateDatabase: string;
  }
}

export default async function setup(project: TestProject) {
  const runId = newRunId();
  const template = await createTemplate(runId, async (url) => {
    // The bootstrap runs before migrations in every real environment (ADR 0023).
    await provisionReplicationFixture(url);
    const connection = createDb(url);
    try {
      await runMigrations(connection);
    } finally {
      await connection.pool.end();
    }
  });
  project.provide("testRunId", runId);
  project.provide("testTemplateDatabase", template);
  return async () => {
    await dropDatabase(template);
  };
}
