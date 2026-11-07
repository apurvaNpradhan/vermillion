import { describe, expect, it } from "vitest";

import { isDeleteConfirmationValid } from "./is-delete-confirmation-valid";

describe("isDeleteConfirmationValid", () => {
  it("matches the email ignoring case and spaces", () => {
    expect(isDeleteConfirmationValid("  Me@Example.com ", "me@example.com")).toBe(true);
  });
  it("rejects anything else, including an unknown email", () => {
    expect(isDeleteConfirmationValid("me@example.org", "me@example.com")).toBe(false);
    expect(isDeleteConfirmationValid("", "me@example.com")).toBe(false);
    expect(isDeleteConfirmationValid("", undefined)).toBe(false);
    expect(isDeleteConfirmationValid("anything", undefined)).toBe(false);
  });
});
