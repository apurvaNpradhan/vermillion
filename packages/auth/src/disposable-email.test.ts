import { describe, expect, it } from "vitest";

import { isDisposableEmail } from "./disposable-email";

describe("isDisposableEmail", () => {
  it("flags providers from the maintained list", () => {
    expect(isDisposableEmail("foo@mailinator.com")).toBe(true);
    expect(isDisposableEmail("foo@yopmail.com")).toBe(true);
  });
  it("matches parent domains, so random subdomains do not evade the list", () => {
    expect(isDisposableEmail("foo@random.mailinator.com")).toBe(true);
    expect(isDisposableEmail("foo@a.b.mailinator.com")).toBe(true);
  });
  it("matches a custom list's parent domains", () => {
    const list = new Set(["throwaway.test"]);
    expect(isDisposableEmail("x@sub.throwaway.test", list)).toBe(true);
    expect(isDisposableEmail("x@notthrowaway.test", list)).toBe(false);
    expect(isDisposableEmail("x@test", list)).toBe(false);
  });
  it("allows real provider domains", () => {
    expect(isDisposableEmail("foo@gmail.com")).toBe(false);
    expect(isDisposableEmail("foo@outlook.com")).toBe(false);
    expect(isDisposableEmail("foo@example.com")).toBe(false);
  });
  it("is case-insensitive and tolerates a trailing dot", () => {
    expect(isDisposableEmail("Foo@MaIlInAtOr.CoM")).toBe(true);
    expect(isDisposableEmail("foo@mailinator.com.")).toBe(true);
  });
  it("handles malformed input", () => {
    expect(isDisposableEmail("")).toBe(false);
    expect(isDisposableEmail("no-at-sign")).toBe(false);
    expect(isDisposableEmail("trailing-at@")).toBe(false);
  });
});
