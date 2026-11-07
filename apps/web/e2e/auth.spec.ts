import { waitForEmailLink } from "./support/emails";
import { expect, test } from "./support/fixtures";
import {
  PASSWORD,
  registerVerifiedUser,
  signInWithUi,
  submitSignUp,
  uniqueEmail,
} from "./support/users";

test.describe("authentication", () => {
  test("sign up, verify the email, sign out and sign in again", async ({ page }) => {
    const email = uniqueEmail();
    await submitSignUp(page, { name: "Ada Lovelace", email });
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

    // Unverified accounts cannot sign in; the attempt sends the verification page.
    await signInWithUi(page, email);
    await expect(page).toHaveURL(/\/verify-email/);

    const link = await waitForEmailLink(email, /Verify your email/);
    await page.goto(link);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Welcome, Ada Lovelace" })).toBeVisible();

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    await signInWithUi(page, email);
    await expect(page).toHaveURL(/\/app$/);
  });

  test("answer a sign-up for an existing address like a new one", async ({ page }) => {
    const { email } = await registerVerifiedUser(page);
    await page.context().clearCookies();
    await submitSignUp(page, { name: "Someone Else", email });
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
  });

  test("reject a wrong password with a translated message", async ({ page }) => {
    const { email } = await registerVerifiedUser(page);
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText("Wrong email or password.");
  });

  test("send a signed-out visitor to sign-in and back to where they were going", async ({
    page,
  }) => {
    const { email } = await registerVerifiedUser(page);
    await page.context().clearCookies();

    await page.goto("/settings/preferences");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fsettings%2Fpreferences/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/settings\/preferences$/);
    await expect(page.getByRole("heading", { name: "Language" })).toBeVisible();
  });

  test("ignore a return location that leaves the app", async ({ page }) => {
    const { email } = await registerVerifiedUser(page);
    await page.context().clearCookies();
    await signInWithUi(page, email, "https://evil.example/phish");
    await expect(page).toHaveURL(/localhost:3001\/app$/);
  });

  test("reset a forgotten password", async ({ page }) => {
    const { email } = await registerVerifiedUser(page);
    await page.context().clearCookies();

    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If an account exists for that address")).toBeVisible();

    await page.goto(await waitForEmailLink(email, /Reset your/));
    await expect(page).toHaveURL(/\/reset-password\?token=/);
    await page.getByLabel("New password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Your password was changed")).toBeVisible();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test("redeem a reset link while an existing browser session is still signed in", async ({
    page,
  }) => {
    const { email } = await registerVerifiedUser(page);
    // A reset may be requested on another device while this browser remains signed in.
    await page.request.post("/api/auth/request-password-reset", {
      data: { email, redirectTo: "/reset-password" },
    });
    await page.goto(await waitForEmailLink(email, /Reset your/));
    await expect(page.getByLabel("New password")).toBeVisible();
    await page.getByLabel("New password").fill("changed-while-signed-in");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Your password was changed")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
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

  test("show an invalid reset link as such", async ({ page }) => {
    await page.goto("/reset-password?error=INVALID_TOKEN");
    await expect(page.getByText("This reset link is invalid or has expired.")).toBeVisible();
  });
});
