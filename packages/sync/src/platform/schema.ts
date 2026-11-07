import { DrizzleAppSchema } from "@powersync/drizzle-driver";

import { notes } from "../notes";
import { installMeta, rejectedWrites } from "./tables";

/** Drizzle tables for typed local queries. */
export const drizzleSchema = { notes, installMeta, rejectedWrites };

/**
 * The PowerSync schema, derived from the Drizzle tables so the two cannot drift. Local-only tables
 * are never synced or uploaded. Index declarations on the Drizzle tables carry over.
 */
export const powerSyncSchema = new DrizzleAppSchema({
  notes: { tableDefinition: notes },
  installMeta: { tableDefinition: installMeta, options: { localOnly: true } },
  rejectedWrites: { tableDefinition: rejectedWrites, options: { localOnly: true } },
});
