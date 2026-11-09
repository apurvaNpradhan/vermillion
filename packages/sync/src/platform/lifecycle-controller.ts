import type { AbstractPowerSyncDatabase } from "@powersync/common";

import { createConnector, type ConnectorSignal } from "./connector";
import type { SyncTransport } from "./transport";
import { claimDeviceOwner, readDeviceOwner } from "./device-owner";
import { ensureInstallId } from "./install-meta";
import {
  transition,
  phaseOwner,
  type LifecycleEffect,
  type LifecycleEvent,
  type Phase,
} from "./lifecycle-state";
import {
  CATALOG_PRIORITY,
  deriveIndicator,
  deriveLockReason,
  trackPendingSince,
  type SyncSnapshot,
} from "./sync-status";

export type LifecycleDatabase = Pick<
  AbstractPowerSyncDatabase,
  | "connect"
  | "currentStatus"
  | "disconnect"
  | "disconnectAndClear"
  | "getNextCrudTransaction"
  | "getOptional"
  | "getUploadQueueStats"
  | "registerListener"
  | "watchWithCallback"
  | "writeTransaction"
>;

export type LifecyclePorts = {
  database: LifecycleDatabase;
  transport: SyncTransport;
  uploadColumns: ReadonlyMap<string, ReadonlySet<string>>;
  now?: () => number;
};

export type SyncLifecycle = {
  getSnapshot(): SyncSnapshot;
  subscribe(listener: () => void): () => void;
  /** Reads the Device owner and starts watching sync status. Call once, first. */
  start(): Promise<void>;
  /** The session as the app learned it (`null` when confirmed signed out). */
  sessionChanged(userId: string | null): Promise<void>;
  /** Unsent local changes; ask this before an explicit sign-out. */
  countUnsent(): Promise<number>;
  /** After the user confirmed (showing `countUnsent`): wipe and hand the device to the new user. */
  discardAndSwitch(): Promise<void>;
  /** The server confirmed this account's deletion. */
  accountDeleted(userId: string): Promise<void>;
  dispose(): void;
};

type Step = { follow: LifecycleEvent[]; abort: boolean };
const DONE: Step = { follow: [], abort: false };

/**
 * Owns connect, upload, disconnect, clear and switch for one database (ADR 0021). Every
 * transition is queued, so there is one in flight; a
 * connector signal from a connection that has since been torn down is ignored (generation fence).
 */
export function createSyncLifecycle(ports: LifecyclePorts): SyncLifecycle {
  const { database, transport, uploadColumns } = ports;
  const now = ports.now ?? Date.now;

  let phase: Phase = { kind: "starting" };
  let lastSession: string | null | undefined;
  let generation = 0;
  let writeScope: string | null = null;
  let pendingCount = 0;
  let pendingSince: number | null = null;
  let snapshot = buildSnapshot();
  let queue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const cleanups: Array<() => void> = [];

  function buildSnapshot(): SyncSnapshot {
    const status = database.currentStatus;
    return {
      phase,
      writeScope: phaseOwner(phase) ? writeScope : null,
      indicator: deriveIndicator(phase, {
        connected: status.connected,
        uploading: status.uploading,
        pendingCount,
      }),
      lockReason: deriveLockReason(phase),
      pendingCount,
      pendingSince,
      lastSyncedAt: status.lastSyncedAt ?? null,
      hasSynced: status.hasSynced === true,
      catalogSynced: status.statusForPriority(CATALOG_PRIORITY)?.hasSynced === true,
    };
  }

  function publish() {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener();
  }

  function enqueue(work: () => Promise<void>): Promise<void> {
    const run = queue.then(work);
    queue = run.catch(() => undefined);
    return run;
  }

  function signalHandler(forGeneration: number) {
    return (signal: ConnectorSignal) => {
      if (forGeneration !== generation) return;
      const type = signal;
      void enqueue(() => dispatch({ type })).catch(() => undefined);
    };
  }

  async function run(effect: LifecycleEffect): Promise<Step> {
    switch (effect.type) {
      case "claim": {
        const actual = await claimDeviceOwner(database, effect.userId);
        if (actual === effect.userId) return DONE;
        // Another tab claimed the database for someone else first: follow it, then re-judge.
        const follow: LifecycleEvent[] = [{ type: "owner-changed", owner: actual }];
        if (lastSession !== undefined) follow.push({ type: "session", userId: lastSession });
        return { follow, abort: true };
      }
      case "connect": {
        writeScope = await ensureInstallId(database);
        publish();
        const connector = createConnector({
          database,
          transport,
          uploadColumns,
          onSignal: signalHandler(generation),
        });
        await database.connect(connector);
        return DONE;
      }
      case "disconnect":
        generation += 1;
        await database.disconnect();
        return DONE;
      case "wipe":
        // Clears local-only tables too: the install id is new afterwards (ADR 0018).
        await database.disconnectAndClear();
        await ensureInstallId(database);
        return { follow: [{ type: "wiped" }], abort: false };
    }
  }

  async function dispatch(first: LifecycleEvent): Promise<void> {
    const pending: LifecycleEvent[] = [first];
    for (let event = pending.shift(); event; event = pending.shift()) {
      const before = phase;
      const next = transition(phase, event);
      phase = next.phase;
      publish();
      try {
        for (const effect of next.effects) {
          const step = await run(effect);
          pending.push(...step.follow);
          if (step.abort) break;
        }
      } catch (error) {
        // A failed wipe leaves the data where it was: go back, never half-switched.
        if (phase.kind === "switching") phase = before;
        publish();
        throw error;
      }
    }
  }

  let started: Promise<void> | undefined;

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      started ??= enqueue(async () => {
        cleanups.push(
          database.registerListener({
            statusChanged: () => publish(),
          }),
        );
        const controller = new AbortController();
        cleanups.push(() => controller.abort());
        database.watchWithCallback(
          "SELECT COUNT(*) AS count FROM ps_crud",
          [],
          {
            onResult: (result) => {
              const count = Number(result.array[0]?.["count"] ?? 0);
              pendingCount = Number.isFinite(count) ? count : 0;
              pendingSince = trackPendingSince(pendingSince, pendingCount, now());
              publish();
            },
          },
          { signal: controller.signal, tables: ["ps_crud"] },
        );
        const owner = await readDeviceOwner(database);
        writeScope = await ensureInstallId(database);
        await dispatch({ type: "owner-loaded", owner });
        if (lastSession !== undefined) await dispatch({ type: "session", userId: lastSession });
      });
      return started;
    },
    sessionChanged(userId) {
      lastSession = userId;
      return enqueue(() => dispatch({ type: "session", userId }));
    },
    async countUnsent() {
      return (await database.getUploadQueueStats()).count;
    },
    discardAndSwitch() {
      return enqueue(() => dispatch({ type: "discard-confirmed" }));
    },
    accountDeleted(userId) {
      return enqueue(() => dispatch({ type: "account-deleted", userId }));
    },
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
      listeners.clear();
    },
  };
}
