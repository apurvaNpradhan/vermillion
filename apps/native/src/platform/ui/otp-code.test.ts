import { describe, expect, it } from "vitest";

import { activeOtpCell, isOtpComplete, sanitizeOtp, startsOtpGroup } from "./otp-code";

describe("sanitizeOtp", () => {
  it("keeps digits only", () => {
    expect(sanitizeOtp("12a3-4 5")).toBe("12345");
    expect(sanitizeOtp("abc")).toBe("");
  });

  it("cuts a paste to the code length", () => {
    expect(sanitizeOtp("123456789")).toBe("123456");
    expect(sanitizeOtp("1234567", 4)).toBe("1234");
  });

  it("reads a spaced or dashed paste as one code", () => {
    expect(sanitizeOtp("123 456")).toBe("123456");
    expect(sanitizeOtp("123-456")).toBe("123456");
  });

  it("drops non-ASCII digits", () => {
    expect(sanitizeOtp("١٢٣")).toBe("");
  });
});

describe("isOtpComplete and activeOtpCell", () => {
  it("completes only when every cell is filled", () => {
    expect(isOtpComplete("12345")).toBe(false);
    expect(isOtpComplete("123456")).toBe(true);
  });

  it("points at the next empty cell, then the last", () => {
    expect(activeOtpCell("")).toBe(0);
    expect(activeOtpCell("123")).toBe(3);
    expect(activeOtpCell("123456")).toBe(5);
  });
});

describe("startsOtpGroup", () => {
  it("breaks a six-cell code into 3 and 3", () => {
    const breaks = [0, 1, 2, 3, 4, 5].filter((index) => startsOtpGroup(index, 3));
    expect(breaks).toEqual([3]);
  });

  it("never breaks an ungrouped code", () => {
    expect([0, 1, 2, 3].some((index) => startsOtpGroup(index, undefined))).toBe(false);
    expect(startsOtpGroup(3, 0)).toBe(false);
  });
});
