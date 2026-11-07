import { appConfig } from "../../../app.config";
import { expect, test } from "./support/fixtures";
import { clickUntil } from "./support/ui";
import { registerVerifiedUser } from "./support/users";

const name = appConfig.displayName;

test.describe("public pages", () => {
  test("render on the server in the signed-out state, without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Welcome to ${name}`);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu" })).toHaveCount(0);
    await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
      "href",
      new RegExp(`^${appConfig.urls.web}/$`),
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await context.close();
  });

  test("use the browser language on a first visit", async ({ browser }) => {
    const context = await browser.newContext({ locale: "de-DE", javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Willkommen bei ${name}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await context.close();
  });

  test("remember a visitor's language choice on this device", async ({ page }) => {
    await page.goto("/");
    await clickUntil(
      page.getByRole("button", { name: "Language" }),
      page.getByRole("menuitemradio", { name: "Deutsch" }),
    );
    await page.getByRole("menuitemradio", { name: "Deutsch" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Willkommen bei ${name}`);

    // Another page, and a reload, are server-rendered in German from the cookie.
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Datenschutzerklärung");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Datenschutzerklärung");
  });

  test("serve legal pages, a sitemap and robots", async ({ page, request }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms of use");
    await expect(page).toHaveTitle(`Terms of use · ${name}`);

    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain(`<loc>${appConfig.urls.web}/privacy</loc>`);
    expect(sitemap).toContain(`<loc>${appConfig.urls.web}/terms</loc>`);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain(`Sitemap: ${appConfig.urls.web}/sitemap.xml`);
  });

  test("fill the navbar's account slot on the client once signed in", async ({ page }) => {
    await registerVerifiedUser(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  });
});
