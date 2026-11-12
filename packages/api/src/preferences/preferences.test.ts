import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";

describe("preferences", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  const rows = async () =>
    Number((await app.rows(sql`select count(*)::int as n from user_preferences`))[0]?.n);

  it("refuses anonymous callers", async () => {
    await expect(app.client().preferences.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(app.client().preferences.update({ locale: "en" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("saves the training preferences and refuses values outside them", async () => {
    const headers = await createSignedInUser(app, "training-prefs@example.com");
    const client = app.client(headers);
    expect(
      await client.preferences.update({
        ui: {
          weightUnit: "lb",
          effortScale: "rir",
          defaultRestSeconds: 90,
          weightIncrementKg: 1.25,
        },
      }),
    ).toMatchObject({ ui: { weightUnit: "lb", effortScale: "rir", defaultRestSeconds: 90 } });
    for (const ui of [
      { weightIncrementKg: 0 },
      { weightIncrementKg: -1 },
      { weightUnit: "stone" },
      { effortScale: "borg" },
      { defaultRestSeconds: 601 },
      { defaultRestSeconds: -1 },
      { defaultRestSeconds: 90.5 },
    ]) {
      // Safety: the test sends values the contract must refuse.
      await expect(client.preferences.update({ ui: ui as never })).rejects.toThrow();
    }
    expect(await client.preferences.get()).toMatchObject({
      ui: { weightUnit: "lb", effortScale: "rir", defaultRestSeconds: 90, weightIncrementKg: 1.25 },
    });
  });

  it("saves the bodyweight and the keep-awake choice and refuses a bodyweight outside 20 to 400 kg", async () => {
    const headers = await createSignedInUser(app, "bodyweight@example.com");
    const client = app.client(headers);
    expect(
      await client.preferences.update({ ui: { bodyweightKg: 82.5, keepAwake: false } }),
    ).toMatchObject({ ui: { bodyweightKg: 82.5, keepAwake: false } });
    for (const ui of [{ bodyweightKg: 19 }, { bodyweightKg: 401 }, { keepAwake: "yes" }]) {
      // Safety: the test sends values the contract must refuse.
      await expect(client.preferences.update({ ui: ui as never })).rejects.toThrow();
    }
    expect(await client.preferences.update({ ui: { bodyweightKg: null } })).toMatchObject({
      ui: { bodyweightKg: null, keepAwake: false },
    });
  });

  it("reads defaults without creating a row", async () => {
    const headers = await createSignedInUser(app, "defaults@example.com");
    const before = await rows();
    expect(await app.client(headers).preferences.get()).toEqual({
      locale: null,
      timezone: null,
      ui: {
        bodyweightKg: null,
        keepAwake: true,
        sounds: true,
        soundRest: true,
        soundSets: true,
        soundMilestones: true,
        sidebarCollapsed: false,
        dismissedHints: [],
        weightIncrementKg: null,
        weightUnit: "kg",
        effortScale: "rpe",
        defaultRestSeconds: 120,
      },
    });
    expect(await rows()).toBe(before);
  });

  it("creates the row on first write and merges later partial updates", async () => {
    const headers = await createSignedInUser(app, "partial@example.com");
    const client = app.client(headers);

    expect(await client.preferences.update({ locale: "en" })).toEqual({
      locale: "en",
      timezone: null,
      ui: {
        bodyweightKg: null,
        keepAwake: true,
        sounds: true,
        soundRest: true,
        soundSets: true,
        soundMilestones: true,
        sidebarCollapsed: false,
        dismissedHints: [],
        weightIncrementKg: null,
        weightUnit: "kg",
        effortScale: "rpe",
        defaultRestSeconds: 120,
      },
    });
    expect(await client.preferences.update({ ui: { sidebarCollapsed: true } })).toMatchObject({
      locale: "en",
      ui: {
        bodyweightKg: null,
        keepAwake: true,
        sounds: true,
        soundRest: true,
        soundSets: true,
        soundMilestones: true,
        sidebarCollapsed: true,
        dismissedHints: [],
        weightIncrementKg: null,
        weightUnit: "kg",
        effortScale: "rpe",
        defaultRestSeconds: 120,
      },
    });
    expect(
      await client.preferences.update({
        timezone: "Europe/Berlin",
        ui: { dismissedHints: ["tour"] },
      }),
    ).toEqual({
      locale: "en",
      timezone: "Europe/Berlin",
      ui: {
        bodyweightKg: null,
        keepAwake: true,
        sounds: true,
        soundRest: true,
        soundSets: true,
        soundMilestones: true,
        sidebarCollapsed: true,
        dismissedHints: ["tour"],
        weightIncrementKg: null,
        weightUnit: "kg",
        effortScale: "rpe",
        defaultRestSeconds: 120,
      },
    });
    // null clears; omitted fields stay
    expect(await client.preferences.update({ locale: null })).toMatchObject({
      locale: null,
      timezone: "Europe/Berlin",
    });
    expect(await client.preferences.get()).toMatchObject({ ui: { sidebarCollapsed: true } });
  });

  it("rejects invalid values", async () => {
    const client = app.client(await createSignedInUser(app, "invalid@example.com"));
    await expect(client.preferences.update({ locale: "de" as "en" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(client.preferences.update({ timezone: "Mars/Olympus" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      client.preferences.update({ ui: { sidebarCollapsed: "yes" as unknown as boolean } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps each user's preferences separate", async () => {
    const a = app.client(await createSignedInUser(app, "iso-a@example.com"));
    const b = app.client(await createSignedInUser(app, "iso-b@example.com"));
    await a.preferences.update({ locale: "en", ui: { sidebarCollapsed: true } });
    expect(await b.preferences.get()).toMatchObject({
      locale: null,
      ui: { sidebarCollapsed: false },
    });
  });

  it("ignores a previously saved unsupported locale without losing other preferences", async () => {
    const session = await createSignedInUser(app, "legacy-locale@example.com");
    const client = app.client(session);
    const { id } = await client.account.me();
    await client.preferences.update({ locale: "en", timezone: "Europe/Berlin" });
    await app.rows(sql`update user_preferences set locale = 'de' where user_id = ${id}`);
    expect(await client.preferences.get()).toMatchObject({
      locale: null,
      timezone: "Europe/Berlin",
    });
    expect(await client.preferences.locale()).toEqual({ locale: "en" });
    expect(await client.preferences.update({ ui: { sidebarCollapsed: true } })).toMatchObject({
      locale: null,
      timezone: "Europe/Berlin",
      ui: { sidebarCollapsed: true },
    });
  });

  describe("locale resolution", () => {
    it("falls back to English for unsupported visitor languages and cookies", async () => {
      expect(
        await app
          .client(new Headers({ "accept-language": "de-DE,de;q=0.9,en;q=0.5" }))
          .preferences.locale(),
      ).toEqual({
        locale: "en",
      });
      expect(
        await app
          .client(new Headers({ cookie: "locale=de", "accept-language": "en" }))
          .preferences.locale(),
      ).toEqual({
        locale: "en",
      });
      expect(await app.client().preferences.locale()).toEqual({ locale: "en" });
    });

    it("uses English for the saved preference", async () => {
      const session = await createSignedInUser(app, "locale@example.com");
      await app.client(session).preferences.update({ locale: "en" });
      const headers = new Headers(session);
      headers.set("cookie", `${session.get("cookie")}; locale=en`);
      headers.set("accept-language", "en");
      expect(await app.client(headers).preferences.locale()).toEqual({ locale: "en" });
    });
  });
});
