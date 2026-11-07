import { expect, newDevice, test } from "./support/fixtures";
import { registerVerifiedUser, signInWithUi } from "./support/users";

test.describe("preferences", () => {
  test("language persists across reloads and follows the account to another device", async ({
    page,
    browser,
  }) => {
    const { email } = await registerVerifiedUser(page);
    await page.goto("/settings/preferences");
    await page.getByRole("combobox", { name: "Language" }).click();
    await page.getByRole("option", { name: "Deutsch" }).click();
    await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();

    // A device that has never seen this user starts in English but follows the account once signed in.
    const other = await newDevice(browser);
    const otherPage = await other.newPage();
    await otherPage.goto("/");
    await expect(otherPage.getByRole("heading", { level: 1 })).toHaveText(/Welcome/);
    await signInWithUi(otherPage, email);
    await expect(otherPage.getByRole("heading", { name: /Willkommen, / })).toBeVisible();
    // The device now remembers it for public pages too.
    await otherPage.goto("/privacy");
    await expect(otherPage.getByRole("heading", { level: 1 })).toHaveText("Datenschutzerklärung");
    await other.close();
  });

  test("switching language from the app menu survives in-app navigation", async ({ page }) => {
    await registerVerifiedUser(page);
    // An explicit saved language puts a non-null locale into the cached preferences.
    await page.goto("/settings/preferences");
    await page.getByRole("combobox", { name: "Language" }).click();
    await page.getByRole("option", { name: "English" }).click();
    await expect.poll(() => page.evaluate(() => document.cookie)).toContain("en");
    await page.getByRole("link", { name: "Dashboard" }).first().click();
    await expect(page.getByRole("heading", { name: /Welcome, / })).toBeVisible();

    await page.getByRole("button", { name: "Language" }).click();
    await page.getByRole("menuitemradio", { name: "Deutsch" }).click();
    await expect(page.getByRole("heading", { name: /Willkommen, / })).toBeVisible();

    // Navigating re-runs the app guard, which must not restore a stale cached language.
    await page.getByRole("link", { name: "Einstellungen" }).first().click();
    await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
    await page.getByRole("link", { name: "Übersicht" }).first().click();
    await expect(page.getByRole("heading", { name: /Willkommen, / })).toBeVisible();
  });

  test("time zone and interface settings are saved to the account", async ({ page }) => {
    await registerVerifiedUser(page);
    await page.goto("/settings/preferences");

    await page.getByRole("combobox", { name: "Time zone" }).click();
    await page.getByRole("option", { name: "Europe/Berlin", exact: true }).click();
    await page.getByRole("switch", { name: /Collapse the sidebar/ }).click();
    await expect(page.getByRole("switch", { name: /Collapse the sidebar/ })).toBeChecked();

    // Wait until the saves reached the server, then read them back on a fresh load.
    await expect
      .poll(async () => {
        await page.reload();
        return [
          await page.getByRole("combobox", { name: "Time zone" }).innerText(),
          await page
            .getByRole("switch", { name: /Collapse the sidebar/ })
            .getAttribute("aria-checked"),
        ];
      })
      .toEqual(["Europe/Berlin", "true"]);
  });

  test("theme is stored per device", async ({ page, browser }) => {
    await registerVerifiedUser(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/settings/preferences");
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Public pages are rendered dark from the cookie, before sign-in or JavaScript.
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Another device keeps its own theme, even for the same account.
    const other = await newDevice(browser);
    const otherPage = await other.newPage();
    await otherPage.emulateMedia({ colorScheme: "light" });
    await otherPage.goto("/");
    await expect(otherPage.locator("html")).not.toHaveClass(/dark/);
    await other.close();
  });
});
