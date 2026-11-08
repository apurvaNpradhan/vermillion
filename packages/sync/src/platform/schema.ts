import { DrizzleAppSchema } from "@powersync/drizzle-driver";

import { notes } from "../notes/tables";
import { deviceOwner, installMeta, rejectedWrites } from "./tables";

/** Drizzle tables for typed local queries. */
export const drizzleSchema = { notes, deviceOwner, installMeta, rejectedWrites };

/**
 * The PowerSync schema, derived from the Drizzle tables so the two cannot drift. Local-only tables
 * are never synced or uploaded. Index declarations on the Drizzle tables carry over.
 */
export const powerSyncSchema = new DrizzleAppSchema({
  notes: { tableDefinition: notes },
  deviceOwner: { tableDefinition: deviceOwner, options: { localOnly: true } },
  installMeta: { tableDefinition: installMeta, options: { localOnly: true } },
  rejectedWrites: { tableDefinition: rejectedWrites, options: { localOnly: true } },
});
