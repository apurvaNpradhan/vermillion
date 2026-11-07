// Vitest global setup: migrates a template database once per run (through the
// production migrator, advisory lock included) and drops it afterwards.
import { createDb } from "@workspace/db";
import { runMigrations } from "@workspace/db/migrator";
import type { TestProject } from "vitest/node";

import { createTemplate, dropDatabase, newRunId } from "./postgres";

declare module "vitest" {
  export interface ProvidedContext {
    testRunId: string;
    testTemplateDatabase: string;
  }
}

export default async function setup(project: TestProject) {
  const runId = newRunId();
  const template = await createTemplate(runId, async (url) => {
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
