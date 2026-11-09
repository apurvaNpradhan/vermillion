import { hasEmail, waitForEmailCode, emailCodes } from "./support/emails";
import { expect, test } from "./support/fixtures";
import {
  completeOnboarding,
  enterCode,
  registerVerifiedUser,
  requestCode,
  signInWithUi,
  uniqueEmail,
} from "./support/users";

test.describe("authentication", () => {
  test("sign up with a code, answer onboarding, sign out and sign in again", async ({ page }) => {
    const email = uniqueEmail();
    await signInWithUi(page, email);
    // A new account is asked its name once; nothing else stands between it and the app.
    await completeOnboarding(page, "Ada Lovelace");
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Welcome, Ada Lovelace" })).toBeVisible();

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    await signInWithUi(page, email);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Welcome, Ada Lovelace" })).toBeVisible();
  });

  test("show the same code screen for an existing address as for a new one", async ({ page }) => {
    const { email } = await registerVerifiedUser(page);
    await page.context().clearCookies();
    await requestCode(page, email);
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await requestCode(page, uniqueEmail("fresh"));
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  });

  test("clear a wrong pasted code and say so", async ({ page }) => {
    const email = uniqueEmail();
    await requestCode(page, email);
    const first = page.getByRole("textbox", { name: "Verification code" });
    await first.evaluate((input) => {
      const data = new DataTransfer();
      data.setData("text", "000000");
      input.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await expect(page.getByRole("alert")).toHaveText("That code is not right. Try again.");
    await expect(first).toHaveValue("");
    for (let digit = 2; digit <= 6; digit++) {
      await expect(page.getByLabel(`Digit ${digit} of 6`)).toHaveValue("");
    }
    // The right code still works afterwards.
    await enterCode(page, emailCodes(email).at(-1) ?? "");
    await completeOnboarding(page, "Ada");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("offer a new code only after the countdown, and send a different one", async ({ page }) => {
    const email = uniqueEmail();
    await page.clock.install();
    const first = await requestCode(page, email);
    const resend = page.getByRole("button", { name: /Send a new code/ });
    await expect(resend).toBeDisabled();
    await expect(resend).toContainText("in");
    await page.clock.fastForward(61_000);
    await expect(resend).toBeEnabled();
    await expect(resend).toHaveText("Send a new code");
    await resend.click();
    await expect(page.getByText("A new code is on its way.")).toBeVisible();
    const second = await waitForEmailCode(email, 1);
    // The old code is retired when a new one is issued.
    if (second !== first) {
      await enterCode(page, first);
      await expect(page.getByRole("alert")).toHaveText("That code is not right. Try again.");
    }
    await enterCode(page, second);
    await completeOnboarding(page, "Ada");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("send a signed-out visitor to sign-in and back to where they were going", async ({
    page,
  }) => {
    const { email } = await registerVerifiedUser(page);
    await page.context().clearCookies();

    await page.goto("/settings/preferences");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fsettings%2Fpreferences/);
    await page.getByLabel("Email").fill(email);
    const seen = emailCodes(email).length;
    await page.getByRole("button", { name: "Send code" }).click();
    await enterCode(page, await waitForEmailCode(email, seen));
    await expect(page).toHaveURL(/\/settings\/preferences$/);
    await expect(page.getByRole("heading", { name: "Language" })).toBeVisible();
  });

  test("ignore a return location that leaves the app", async ({ page }) => {
    const { email } = await registerVerifiedUser(page);
    await page.context().clearCookies();
    await signInWithUi(page, email, "https://evil.example/phish");
    await expect(page).toHaveURL(/localhost:3001\/app$/);
  });

  test("ask for the name before the app, and keep asking until it is given", async ({ page }) => {
    await signInWithUi(page, uniqueEmail());
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    // Leaving for the app is not an escape.
    await page.goto("/app");
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel("Name").fill("Grace");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("send a signed-out visitor from the code screen or onboarding to sign-in", async ({
    page,
  }) => {
    await page.goto("/verify-code");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login/);
  });

  test("changes the email address with a code sent to the new one", async ({ page }) => {
    const { email } = await registerVerifiedUser(page);
    const next = uniqueEmail("changed");
    await page.goto("/settings");
    await page.getByRole("button", { name: "Change" }).click();
    await page.getByLabel("New email address").fill(next);
    await page.getByRole("button", { name: "Send code" }).click();
    await enterCode(page, await waitForEmailCode(next, 0));
    await expect(page.getByText("Email address changed")).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(next);
    await expect.poll(() => hasEmail(email, /Security notice/)).toBe(true);
  });

  test("shows translated OAuth callback errors without echoing provider text", async ({ page }) => {
    await page.goto("/login?error=access_denied");
    await expect(page.getByRole("alert")).toHaveText(
      "Sign-in was cancelled or refused by the provider.",
    );
    await page.goto("/login?error=untrusted-provider-details");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("alert")).not.toContainText("untrusted-provider-details");
  });
});
