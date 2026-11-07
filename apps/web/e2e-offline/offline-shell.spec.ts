import { expect, test, type Page } from "@playwright/test";

async function waitForControllingWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        }),
      );
    }
  });
}

test("a closed app cold-starts offline on a deep link with its local database", async ({
  context,
  page,
}) => {
  // Online first visit: installs the worker and creates the database.
  await page.goto("/diagnostics");
  const installId = page.getByTestId("install-id");
  await expect(installId).toBeVisible({ timeout: 30_000 });
  const firstId = await installId.innerText();
  expect(firstId).toMatch(/^[0-9a-f-]{36}$/);
  await waitForControllingWorker(page);

  // Close the app, then go offline: nothing is loaded in memory any more.
  await page.close();
  await context.setOffline(true);

  const reopened = await context.newPage();
  await reopened.goto("/diagnostics");
  await expect(reopened.getByTestId("install-id")).toHaveText(firstId, { timeout: 30_000 });

  // A public server-rendered page also opens, from the shell, instead of the browser error page.
  await reopened.goto("/terms");
  await expect(reopened.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });

  // The worker never stored API, RPC or auth responses.
  const cachedUrls = await reopened.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
  expect(cachedUrls.length).toBeGreaterThan(10);
  expect(cachedUrls).toContain("/_shell");
  expect(cachedUrls.some((path) => path.endsWith(".wasm"))).toBe(true);
  expect(cachedUrls.filter((path) => path.startsWith("/api/") || path.startsWith("/rpc/"))).toEqual(
    [],
  );
});
