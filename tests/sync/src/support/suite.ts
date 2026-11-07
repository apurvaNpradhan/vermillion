import { afterAll, beforeAll } from "vitest";

import { checkPrerequisites, describeProblems } from "../prerequisites";
import { createClient, type SyncClient } from "./client";
import { database } from "./users";

/**
 * Per-file set-up shared by the seam 3 suites: checks the stack, tracks the clients a test
 * opens, closes them and the shared pool afterwards. Isolation is by data (every test makes
 * its own users), so nothing is cleaned up.
 */
export function useSyncSuite() {
  const clients: SyncClient[] = [];
  beforeAll(async () => {
    const problems = await checkPrerequisites();
    if (problems.length > 0) throw new Error(describeProblems(problems));
  });
  afterAll(async () => {
    await Promise.allSettled(clients.map((client) => client.close()));
    await database.end();
  });
  return async function newClient(...args: Parameters<typeof createClient>) {
    const client = await createClient(...args);
    clients.push(client);
    return client;
  };
}

export const within = { timeout: 30_000 };
