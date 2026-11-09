import { waitForEmailLink } from "./support/emails";
import { expect, test } from "./support/fixtures";
import { registerVerifiedUser } from "./support/users";

test("a user deletes their account with a typed and an emailed confirmation", async ({ page }) => {
  const { email } = await registerVerifiedUser(page);
  await page.goto("/settings");

  const deleteButton = page.getByRole("button", { name: "Delete my account" });
  await expect(deleteButton).toBeDisabled();
  await page.getByLabel(`Type ${email} to confirm`).fill("someone-else@example.com");
  await expect(deleteButton).toBeDisabled();
  await page.getByLabel(`Type ${email} to confirm`).fill(email);
  await deleteButton.click();
  await expect(page.getByText("Check your inbox and follow the link")).toBeVisible();

  // Nothing is deleted until the emailed link is followed.
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

  await page.goto(await waitForEmailLink(email, /Confirm deleting/));
  await expect(page).toHaveURL(/\/\?account=deleted$/);
  await expect(page.getByText("Your account was deleted and your data removed.")).toBeVisible();

  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
});
