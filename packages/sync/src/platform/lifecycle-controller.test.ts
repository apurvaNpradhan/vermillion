import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import type { SyncTransport } from "./transport";
import { claimDeviceOwner, readDeviceOwner } from "./device-owner";
import { ensureInstallId } from "./install-meta";
import { uploadColumns } from "./upload-columns";
import { crudEntry, createFakeDatabase } from "./fake-database";
import { createSyncLifecycle } from "./lifecycle-controller";

const EXERCISE = "01900000-0000-7000-8000-000000000001";

function setup(options: { transport?: Partial<SyncTransport>; owner?: string } = {}) {
  const fake = createFakeDatabase();
  const transport: SyncTransport = {
    credentials: async () => ({
      endpoint: "https://sync.example.test",
      token: "jwt",
      userId: "a",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    }),
    upload: async () => ({ status: "applied" }),
    ...options.transport,
  };
  const lifecycle = createSyncLifecycle({
    database: fake.database,
    transport,
    uploadColumns,
  });
  const ready = async () => {
    await ensureInstallId(fake.database);
    if (options.owner) await claimDeviceOwner(fake.database, options.owner);
    await lifecycle.start();
  };
  return { ...fake, lifecycle, ready };
}

const phase = (s: ReturnType<typeof setup>) => s.lifecycle.getSnapshot().phase.kind;

describe("sync lifecycle", () => {
  it("a first sign-in claims the database and connects", async () => {
    const s = setup();
    await s.ready();
    expect(phase(s)).toBe("unclaimed");
    await s.lifecycle.sessionChanged("a");
    expect(await readDeviceOwner(s.database)).toBe("a");
    expect(phase(s)).toBe("active");
    expect(s.state.connects).toBe(1);
  });

  it("a session known before start is applied once the owner is loaded", async () => {
    const s = setup({ owner: "a" });
    const early = s.lifecycle.sessionChanged("b");
    await s.ready();
    await early;
    expect(phase(s)).toBe("blocked");
    expect(s.state.connects).toBe(1);
    expect(s.state.disconnects).toBe(1);
  });

  it("session expiry mid-upload keeps the queue and the data, then resumes for the same user", async () => {
    const s = setup({
      owner: "a",
      transport: {
        upload: async () => {
          throw new ORPCError("UNAUTHORIZED");
        },
      },
    });
    await s.ready();
    s.queue([crudEntry("PATCH", EXERCISE, { title: "unsent" })], 1);
    await s.database.writeTransaction(async (tx) => {
      await tx.execute("INSERT INTO exercise (id, title) VALUES (?, ?)", [EXERCISE, "unsent"]);
    });

    await expect(s.state.connector?.uploadData(s.database as never)).rejects.toThrow();
    // The connector's signal is queued, not awaited by the upload; let it settle.
    await settle();

    expect(phase(s)).toBe("reauth-required");
    expect(s.pendingTransactions()).toBe(1);
    expect(s.state.clears).toBe(0);
    expect(s.sqlite.prepare("SELECT COUNT(*) AS n FROM exercise").get()).toMatchObject({ n: 1 });
    expect(s.lifecycle.getSnapshot().indicator).toBe("locked");

    // Same user signs in again.
    await s.lifecycle.sessionChanged(null);
    await s.lifecycle.sessionChanged("a");
    expect(phase(s)).toBe("active");
    expect(s.state.connects).toBe(2);
  });

  it("credentials for another account never connect, and block", async () => {
    const s = setup({
      owner: "a",
      transport: {
        credentials: async () => ({
          endpoint: "https://sync.example.test",
          token: "jwt",
          userId: "b",
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        }),
      },
    });
    await s.ready();
    await expect(s.state.connector?.fetchCredentials()).rejects.toMatchObject({
      kind: "wrong-account",
    });
    await settle();
    expect(phase(s)).toBe("blocked");
    expect(s.state.clears).toBe(0);
  });

  it("a different user is blocked; discarding wipes, re-claims and gets a new install id", async () => {
    const s = setup({ owner: "a" });
    await s.ready();
    const installBefore = s.sqlite.prepare("SELECT install_id FROM install_meta").get();
    s.queue([crudEntry("PUT", EXERCISE, { title: "mine" })], 1);

    await s.lifecycle.sessionChanged("b");
    expect(phase(s)).toBe("blocked");
    expect(await s.lifecycle.countUnsent()).toBe(1);
    expect(s.state.clears).toBe(0);

    await s.lifecycle.discardAndSwitch();
    expect(s.state.clears).toBe(1);
    expect(await readDeviceOwner(s.database)).toBe("b");
    expect(phase(s)).toBe("active");
    expect(s.pendingTransactions()).toBe(0);
    expect(s.sqlite.prepare("SELECT install_id FROM install_meta").get()).not.toEqual(
      installBefore,
    );
  });

  it("does not wipe when discard is not confirmed from a blocked state", async () => {
    const s = setup({ owner: "a" });
    await s.ready();
    await s.lifecycle.discardAndSwitch();
    expect(s.state.clears).toBe(0);
    expect(phase(s)).toBe("active");
  });

  it("wipes after the owner's server-confirmed deletion only", async () => {
    const s = setup({ owner: "a" });
    await s.ready();
    await s.lifecycle.accountDeleted("someone-else");
    expect(s.state.clears).toBe(0);
    await s.lifecycle.accountDeleted("a");
    expect(s.state.clears).toBe(1);
    expect(await readDeviceOwner(s.database)).toBeNull();
    expect(phase(s)).toBe("unclaimed");
  });

  it("an incompatible client pauses uploads and keeps the queue", async () => {
    const s = setup({
      owner: "a",
      transport: {
        upload: async () => {
          throw new ORPCError("BAD_REQUEST", { data: { code: "SYNC_CLIENT_INCOMPATIBLE" } });
        },
      },
    });
    await s.ready();
    s.queue([crudEntry("PATCH", EXERCISE, { title: "x" })], 1);
    await expect(s.state.connector?.uploadData(s.database as never)).rejects.toThrow();
    await settle();
    expect(phase(s)).toBe("update-required");
    expect(s.lifecycle.getSnapshot().indicator).toBe("update-required");
    expect(s.pendingTransactions()).toBe(1);
  });

  it("ignores a signal from a connection that was already torn down", async () => {
    const s = setup({
      owner: "a",
      transport: {
        upload: async () => {
          throw new ORPCError("UNAUTHORIZED");
        },
      },
    });
    await s.ready();
    const stale = s.state.connector;
    await s.lifecycle.sessionChanged("b"); // blocked: disconnects, bumps the generation
    s.queue([crudEntry("PATCH", EXERCISE, { title: "x" })], 1);
    await expect(stale?.uploadData(s.database as never)).rejects.toThrow();
    await settle();
    expect(phase(s)).toBe("blocked");
  });

  it("serialises overlapping transitions: concurrent sign-ins end in one consistent state", async () => {
    const s = setup();
    await s.ready();
    await Promise.all([s.lifecycle.sessionChanged("a"), s.lifecycle.sessionChanged("b")]);
    expect(await readDeviceOwner(s.database)).toBe("a");
    expect(phase(s)).toBe("blocked");
    expect(s.state.clears).toBe(0);
  });

  it("another tab claiming first is followed, not overwritten", async () => {
    const s = setup();
    await s.ready();
    // Another tab claimed the database between our read and our claim.
    await claimDeviceOwner(s.database, "a");
    await s.lifecycle.sessionChanged("b");
    expect(await readDeviceOwner(s.database)).toBe("a");
    expect(phase(s)).toBe("blocked");
    expect(s.state.connects).toBe(0);
  });

  it("publishes no write scope during a reset, then a new one for the new owner", async () => {
    const s = setup({ owner: "a" });
    await s.ready();
    const oldScope = s.lifecycle.getSnapshot().writeScope;
    const scopes: Array<string | null> = [];
    s.lifecycle.subscribe(() => scopes.push(s.lifecycle.getSnapshot().writeScope));
    await s.lifecycle.sessionChanged("b");
    await s.lifecycle.discardAndSwitch();
    expect(scopes).toContain(null);
    expect(s.lifecycle.getSnapshot().writeScope).not.toBe(oldScope);
    expect(s.lifecycle.getSnapshot().writeScope).not.toBeNull();
  });

  it("publishes the pending count and the time it first filled", async () => {
    const s = setup({ owner: "a" });
    await s.ready();
    let notified = 0;
    s.lifecycle.subscribe(() => (notified += 1));
    s.queue([crudEntry("PUT", EXERCISE, { title: "x" })], 1);
    expect(s.lifecycle.getSnapshot().pendingCount).toBe(1);
    expect(s.lifecycle.getSnapshot().pendingSince).not.toBeNull();
    expect(notified).toBeGreaterThan(0);
  });
});

/** Lets queued, un-awaited transitions (connector signals) finish. */
async function settle() {
  for (let round = 0; round < 5; round += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}
