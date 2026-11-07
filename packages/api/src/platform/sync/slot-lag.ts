import { log } from "@workspace/logger";
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@workspace/db";
import { defineQueue } from "../jobs/index";

const MIB = 1024 * 1024;

/** PowerSync names its slots with this prefix (`slot_name_prefix` default). */
const SLOT_PREFIX = "powersync_";

/**
 * The one stable event name an external log monitor matches on for a critical
 * slot (lagging or invalidated). Do not rename it without updating the docs.
 */
export const SLOT_LAG_ALERT_ACTION = "sync.alert.slot-lag-critical";

export type SlotLagThresholds = { warnBytes: number; criticalBytes: number };

export const thresholdsFromMegabytes = (warnMb: number, criticalMb: number): SlotLagThresholds => ({
  warnBytes: warnMb * MIB,
  criticalBytes: criticalMb * MIB,
});

export const slotRowSchema = z.object({
  slot_name: z.string(),
  active: z.boolean(),
  wal_status: z.string().nullable(),
  /** WAL between the current position and what the consumer confirmed. */
  lag_bytes: z.coerce.number().nullable(),
  /** How much more WAL may be written before the slot is invalidated; null when unlimited. */
  safe_wal_size: z.coerce.number().nullable(),
  invalidation_reason: z.string().nullable(),
});
export type SlotRow = z.infer<typeof slotRowSchema>;

export type SlotLevel = "ok" | "warn" | "critical";
export type SlotReport = {
  name: string;
  level: SlotLevel;
  active: boolean;
  lagBytes: number | null;
  walStatus: string | null;
  safeWalSize: number | null;
  invalidated: boolean;
};

export type SlotLagReport = {
  /** `absent` means no PowerSync slot exists yet; it is not an alarm (see `classifySlots`). */
  status: "absent" | SlotLevel;
  slots: SlotReport[];
};

const ORDER: Record<SlotLevel, number> = { ok: 0, warn: 1, critical: 2 };

/**
 * Turns slot rows into a status. Pure.
 *
 * - An invalidated slot (`wal_status = 'lost'` or any invalidation reason) is
 *   critical: PowerSync must resnapshot. So is `unreserved`: the slot is already
 *   past its WAL budget and the next checkpoint may remove what it still needs.
 * - Lag at or above the critical threshold is critical; at or above the warn
 *   threshold is a warning.
 * - No slot at all is `absent`, not critical: PowerSync creates its slot when
 *   it first connects, and a deployment without sync has none. A service that
 *   never connects is caught by the external reachability probe (ADR 0025),
 *   not by this job.
 */
export function classifySlots(rows: SlotRow[], thresholds: SlotLagThresholds): SlotLagReport {
  const slots = rows.map((row): SlotReport => {
    const invalidated = row.wal_status === "lost" || row.invalidation_reason !== null;
    const lag = row.lag_bytes;
    let level: SlotLevel = "ok";
    if (
      invalidated ||
      row.wal_status === "unreserved" ||
      (lag !== null && lag >= thresholds.criticalBytes)
    ) {
      level = "critical";
    } else if (lag !== null && lag >= thresholds.warnBytes) {
      level = "warn";
    }
    return {
      name: row.slot_name,
      level,
      active: row.active,
      lagBytes: lag,
      walStatus: row.wal_status,
      safeWalSize: row.safe_wal_size,
      invalidated,
    };
  });
  const status = slots.reduce<SlotLevel>(
    (worst, slot) => (ORDER[slot.level] > ORDER[worst] ? slot.level : worst),
    "ok",
  );
  return { status: slots.length === 0 ? "absent" : status, slots };
}

/** Reads this database's PowerSync slots. `to_jsonb` keeps the query valid before Postgres 17's `invalidation_reason`. */
export async function readReplicationSlots(db: Database): Promise<SlotRow[]> {
  const result = await db.execute(sql`
    SELECT slot_name,
           active,
           wal_status,
           pg_wal_lsn_diff(pg_current_wal_lsn(), COALESCE(confirmed_flush_lsn, restart_lsn)) AS lag_bytes,
           safe_wal_size,
           to_jsonb(s) ->> 'invalidation_reason' AS invalidation_reason
      FROM pg_replication_slots s
     WHERE slot_type = 'logical'
       AND database = current_database()
       AND slot_name LIKE ${`${SLOT_PREFIX}%`}
     ORDER BY slot_name
  `);
  return z.object({ rows: z.array(slotRowSchema) }).parse(result).rows;
}

/** Logs the slot report: info when fine, warn and error at the thresholds. Only names and numbers. */
export function logSlotReport(report: SlotLagReport) {
  if (report.status === "absent") {
    log.info({ action: "sync.slot-lag", status: "absent" });
    return;
  }
  for (const slot of report.slots) {
    const fields = {
      action: "sync.slot-lag",
      slot: slot.name,
      active: slot.active,
      lagBytes: slot.lagBytes ?? undefined,
      walStatus: slot.walStatus ?? undefined,
      safeWalSize: slot.safeWalSize ?? undefined,
      invalidated: slot.invalidated,
    };
    if (slot.level === "critical") {
      log.error({ ...fields, action: SLOT_LAG_ALERT_ACTION, status: "critical" });
    } else if (slot.level === "warn") log.warn({ ...fields, status: "warn" });
    else log.info({ ...fields, status: "ok" });
  }
}

/** Every five minutes. A supplement to the external alerts: it cannot report its own stack's outage. */
export const slotLagQueue = defineQueue({
  name: "sync.slot-lag",
  schema: z.object({}),
  cron: "*/5 * * * *",
  // A late sample is worthless; the next one is five minutes away.
  retryLimit: 0,
  handler: async (_data, { services }) => {
    logSlotReport(
      classifySlots(await readReplicationSlots(services.db), services.config.sync.slotLag),
    );
  },
});
