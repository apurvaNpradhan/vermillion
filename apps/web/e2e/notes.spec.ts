import { expect, newDevice, test } from "./support/fixtures";
import { registerVerifiedUser } from "./support/users";

test.describe("notes (example vertical)", () => {
  test("a user creates, edits and deletes a note", async ({ page }) => {
    await registerVerifiedUser(page);
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

    // The note is stored on the server, not just in the page.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Shopping" })).toBeVisible();

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

  test("the notes page needs a signed-in user", async ({ page }) => {
    await page.goto("/notes");
    await expect(page).toHaveURL(/\/login/);
  });
});
