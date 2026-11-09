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

  it("reads defaults without creating a row", async () => {
    const headers = await createSignedInUser(app, "defaults@example.com");
    const before = await rows();
    expect(await app.client(headers).preferences.get()).toEqual({
      locale: null,
      timezone: null,
      ui: { sidebarCollapsed: false, dismissedHints: [] },
    });
    expect(await rows()).toBe(before);
  });

  it("creates the row on first write and merges later partial updates", async () => {
    const headers = await createSignedInUser(app, "partial@example.com");
    const client = app.client(headers);

    expect(await client.preferences.update({ locale: "en" })).toEqual({
      locale: "en",
      timezone: null,
      ui: { sidebarCollapsed: false, dismissedHints: [] },
    });
    expect(await client.preferences.update({ ui: { sidebarCollapsed: true } })).toMatchObject({
      locale: "en",
      ui: { sidebarCollapsed: true, dismissedHints: [] },
    });
    expect(
      await client.preferences.update({
        timezone: "Europe/Berlin",
        ui: { dismissedHints: ["tour"] },
      }),
    ).toEqual({
      locale: "en",
      timezone: "Europe/Berlin",
      ui: { sidebarCollapsed: true, dismissedHints: ["tour"] },
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
