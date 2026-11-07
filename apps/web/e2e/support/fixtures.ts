import { test as base, type Browser, type BrowserContext } from "@playwright/test";

let clients = 0;

/**
 * A distinct client address per browser context. The dev proxy appends the
 * real peer to X-Forwarded-For and the server trusts only that peer, so the
 * address given here becomes the client IP the rate limiters see. Without it
 * every test would share one sign-up budget.
 */
function nextClientHeaders() {
  clients += 1;
  return { "x-forwarded-for": `10.${(clients >> 8) & 255}.${clients & 255}.${Date.now() % 250}` };
}

export const test = base.extend({
  // Playwright reads the fixtures a function needs from its first, destructured argument.
  // oxlint-disable-next-line no-empty-pattern
  extraHTTPHeaders: async ({}, use) => {
    await use(nextClientHeaders());
  },
});

export { expect } from "@playwright/test";

/** A second, independent device (own cookies and storage). */
export function newDevice(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ extraHTTPHeaders: nextClientHeaders() });
}
