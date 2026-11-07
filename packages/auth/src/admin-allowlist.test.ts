import { describe, expect, it } from "vitest";

import { isAdminEmail, isAdminRole, parseAdminEmails } from "./admin-allowlist";

describe("admin allowlist", () => {
  it("parses a comma-separated list, trimmed and lowercased", () => {
    expect(parseAdminEmails(" Admin@Example.com, ops@example.com ,,")).toEqual([
      "admin@example.com",
      "ops@example.com",
    ]);
    expect(parseAdminEmails(undefined)).toEqual([]);
  });
  it("grants admin only to verified listed emails", () => {
    const list = parseAdminEmails("admin@example.com");
    expect(isAdminEmail("ADMIN@example.com", true, list)).toBe(true);
    expect(isAdminEmail("admin@example.com", false, list)).toBe(false);
    expect(isAdminEmail("other@example.com", true, list)).toBe(false);
  });
  it("reads comma-separated roles", () => {
    expect(isAdminRole("user,admin")).toBe(true);
    expect(isAdminRole("administrator")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });
});
