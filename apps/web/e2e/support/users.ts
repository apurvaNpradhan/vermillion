import { expect, type Page } from "@playwright/test";

import { emailCodes, waitForEmailCode } from "./emails";

let counter = 0;
export function uniqueEmail(prefix = "user") {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}@example.com`;
}

/** Asks for a code on the email screen and waits for the code screen; returns the emailed code. */
export async function requestCode(page: Page, email: string, redirect?: string) {
  const seen = emailCodes(email).length;
  await page.goto(redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page).toHaveURL(/\/verify-code/);
  return waitForEmailCode(email, seen);
}

/** Types a code into the first digit; the field spreads it and submits on the last one. */
export async function enterCode(page: Page, code: string) {
  await page.getByRole("textbox", { name: "Verification code" }).pressSequentially(code);
}

/** Signs in through the real flow: email screen, emailed code, code screen. */
export async function signInWithUi(page: Page, email: string, redirect?: string) {
  const code = await requestCode(page, email, redirect);
  await enterCode(page, code);
}

/** Answers the name question of onboarding. */
export async function completeOnboarding(page: Page, name: string) {
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Creates a signed-in user through the real flow: first code, then onboarding. */
export async function registerVerifiedUser(page: Page, email = uniqueEmail(), name = "Test User") {
  await signInWithUi(page, email);
  await completeOnboarding(page, name);
  await expect(page).toHaveURL(/\/app$/);
  return { email, name };
}
