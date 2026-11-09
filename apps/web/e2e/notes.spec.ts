import { expect, newDevice, test } from "./support/fixtures";
import { registerVerifiedUser, signInWithUi } from "./support/users";

test.describe("notes (example vertical)", () => {
  test("a user creates, edits and deletes a note", async ({ page, browser }) => {
    const { email } = await registerVerifiedUser(page);
    await page.goto("/notes");
    await expect(page.getByText("No notes yet.")).toBeVisible();

    await page.getByLabel("Title").fill("Groceries");
    await page.getByLabel("Body").fill("Milk and eggs");
    await page.getByRole("button", { name: "Add note" }).click();
    const note = page.getByTestId("note");
    await expect(note).toHaveCount(1);
    await expect(note.getByRole("heading", { name: "Groceries" })).toBeVisible();
    await expect(note.getByText("Milk and eggs")).toBeVisible();

    await note.getByRole("button", { name: "Edit" }).click();
    await note.getByLabel("Title").fill("Shopping");
    await note.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("note").getByRole("heading", { name: "Shopping" })).toBeVisible();

    // Wait for reconciliation too: a local echo alone cannot prove the download stream
    // agrees with the upload database. The note must survive acknowledgement and reload.
    await expect(page.getByText("All changes are synced.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Shopping" })).toBeVisible();

    // A fresh device has no local echo: this proves the server's download stream contains it.
    const other = await newDevice(browser);
    try {
      const otherPage = await other.newPage();
      await signInWithUi(otherPage, email, "/notes");
      await expect(otherPage).toHaveURL(/\/notes$/);
      await expect(otherPage.getByRole("heading", { name: "Shopping" })).toBeVisible();
    } finally {
      await other.close();
    }

    await page.getByTestId("note").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No notes yet.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("No notes yet.")).toBeVisible();
  });

  test("notes are private to their owner", async ({ page, browser }) => {
    await registerVerifiedUser(page);
    await page.goto("/notes");
    await page.getByLabel("Title").fill("Private");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByTestId("note")).toHaveCount(1);

    const other = await newDevice(browser);
    const otherPage = await other.newPage();
    await registerVerifiedUser(otherPage);
    await otherPage.goto("/notes");
    await expect(otherPage.getByText("No notes yet.")).toBeVisible();
    await other.close();
  });

  test("switching accounts in another tab clears an unsaved draft", async ({ page }) => {
    await registerVerifiedUser(page);
    await page.goto("/notes");
    await page.getByLabel("Title").fill("Account A private draft");
    await page.getByLabel("Body").fill("Do not copy this into account B");

    // Tabs share cookies, OPFS and the worker, but not React form state.
    const other = await page.context().newPage();
    try {
      await other.goto("/app");
      await other.getByRole("button", { name: "Account menu" }).click();
      await other.getByRole("menuitem", { name: "Sign out" }).click();
      await expect(other).toHaveURL(/\/$/);
      await registerVerifiedUser(other);
      await other.getByRole("button", { name: "Discard and switch", exact: true }).click();
      const confirmation = other.getByRole("alertdialog");
      await confirmation.getByRole("button", { name: "Discard and switch", exact: true }).click();
      await expect(confirmation).not.toBeVisible();

      // The untouched first tab must reset its form, not just read the new account's rows.
      await expect(page.getByLabel("Title")).toHaveValue("");
      await expect(page.getByLabel("Body")).toHaveValue("");
      await expect(page.getByRole("button", { name: "Add note" })).toBeDisabled();
      await other.goto("/notes");
      await expect(other.getByTestId("note")).toHaveCount(0);
    } finally {
      await other.close();
    }
  });

  test("the notes page needs a signed-in user", async ({ page }) => {
    await page.goto("/notes");
    await expect(page).toHaveURL(/\/login/);
  });
});
