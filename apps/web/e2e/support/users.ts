import { expect, type Page } from "@playwright/test";

import { waitForEmailLink } from "./emails";

export const PASSWORD = "correct-horse-battery";

let counter = 0;
export function uniqueEmail(prefix = "user") {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}@example.com`;
}

/** Fills the sign-up form and submits it. */
export async function submitSignUp(page: Page, user: { name: string; email: string }) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
}

/** Opens the emailed verification link, which verifies the address and signs the user in. */
export async function verifyEmail(page: Page, email: string) {
  const link = await waitForEmailLink(email, /Verify your email/);
  await page.goto(link);
  await expect(page).toHaveURL(/\/app$/);
}

/** Creates a verified, signed-in user through the real sign-up and verification flow. */
export async function registerVerifiedUser(page: Page, email = uniqueEmail(), name = "Test User") {
  await submitSignUp(page, { name, email });
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await verifyEmail(page, email);
  return { email, name, password: PASSWORD };
}

export async function signInWithUi(page: Page, email: string, redirect?: string) {
  await page.goto(redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}
