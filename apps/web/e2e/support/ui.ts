import { expect, type Locator } from "@playwright/test";

/**
 * Clicks a control until `result` shows. Server-rendered pages are interactive
 * only after hydration; an early click is silently dropped, so retry it.
 */
export async function clickUntil(control: Locator, result: Locator) {
  await expect(async () => {
    await control.click();
    await expect(result).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}
