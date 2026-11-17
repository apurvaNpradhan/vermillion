import { describe, expect, it } from "vitest";

import { isAdminEmail, parseAdminEmails } from "./admin-allowlist";

describe("admin allowlist", () => {
  it("parses a comma-separated, case-insensitive list", () => {
    expect(parseAdminEmails(" Owner@Example.com, ,b@x.io ")).toEqual([
      "owner@example.com",
      "b@x.io",
    ]);
    expect(parseAdminEmails(undefined)).toEqual([]);
  });

  it("admits only a verified listed address", () => {
    const list = ["owner@example.com"];
    expect(isAdminEmail("OWNER@example.com", true, list)).toBe(true);
    expect(isAdminEmail("owner@example.com", false, list)).toBe(false);
    expect(isAdminEmail("other@example.com", true, list)).toBe(false);
  });
});
