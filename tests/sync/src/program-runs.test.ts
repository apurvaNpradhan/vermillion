import { activeRun } from "@workspace/shared";
import {
  activateProgram,
  claimDeviceOwner,
  createProgram,
  ensureInstallId,
  powerSyncSchema,
  readRuns,
} from "@workspace/sync";
import { expect, it, vi } from "vitest";
import { useSyncSuite, within } from "./support/suite";
import { createUser } from "./support/users";

const newClient = useSyncSuite();
it("activation on one device appears on another device", async () => {
  const user = await createUser();
  const a = await newClient(user, {}, powerSyncSchema);
  const b = await newClient(user, {}, powerSyncSchema);
  for (const client of [a, b]) {
    await claimDeviceOwner(client.database, user.userId);
    await ensureInstallId(client.database);
    await client.connect();
  }
  const programId = await createProgram(a.database, {
    title: "Run sync",
    description: null,
    planned_weeks: 4,
  });
  const id = await activateProgram(a.database, programId);
  await a.uploaded();
  await vi.waitFor(async () => {
    expect(activeRun(await readRuns(b.database))?.id).toBe(id);
    expect(activeRun(await readRuns(b.database))?.program_id).toBe(programId);
  }, within);
});
