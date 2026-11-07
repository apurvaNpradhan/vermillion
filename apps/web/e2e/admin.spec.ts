import { expect, newDevice, test } from "./support/fixtures";
import { registerVerifiedUser, signInWithUi, uniqueEmail } from "./support/users";

const ADMIN_EMAIL = "e2e-admin@example.com";

test.describe("admin", () => {
  test("keeps a regular user out of the admin page", async ({ page }) => {
    await registerVerifiedUser(page);
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("lets an admin find, ban, unban and delete users", async ({ page, browser }) => {
    // The admin allowlist grants the role to this verified address.
    await registerVerifiedUser(page, ADMIN_EMAIL, "Admin Person");
    const victimDevice = await newDevice(browser);
    const victimPage = await victimDevice.newPage();
    const victim = await registerVerifiedUser(victimPage, uniqueEmail("victim"), "Victim");

    await page.goto("/app");
    await page.getByRole("link", { name: "Users" }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);

    await page.getByRole("searchbox", { name: "Search users" }).fill(victim.email);
    const row = page.getByTestId("admin-user-row").filter({ hasText: victim.email });
    await expect(row).toHaveCount(1);
    await expect(row.getByText("Active")).toBeVisible();

    await row.getByRole("button", { name: "Ban" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Ban" }).click();
    await expect(row.getByText("Banned")).toBeVisible();

    // A banned user's sessions stop working at once.
    await victimPage.goto("/app");
    await expect(victimPage).toHaveURL(/\/login/);
    await signInWithUi(victimPage, victim.email);
    await expect(victimPage.getByRole("alert")).toHaveText("This account is suspended.");

    await row.getByRole("button", { name: "Unban" }).click();
    await expect(row.getByText("Active")).toBeVisible();
    await signInWithUi(victimPage, victim.email);
    await expect(victimPage).toHaveURL(/\/app$/);

    await row.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("admin-user-row").filter({ hasText: victim.email })).toHaveCount(
      0,
    );
    await victimDevice.close();
  });
});
