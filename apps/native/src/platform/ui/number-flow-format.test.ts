import { describe, expect, it } from "vitest";

import { tokenizeNumber, tokensToText } from "./number-flow-format";

const text = (value: number, format?: Parameters<typeof tokenizeNumber>[1]) =>
  tokensToText(tokenizeNumber(value, format));

describe("tokenizeNumber", () => {
  it("formats integers and fixed decimals", () => {
    expect(text(1840)).toBe("1840");
    expect(text(82.4, { decimals: 1 })).toBe("82.4");
    expect(text(82, { decimals: 1 })).toBe("82.0");
    expect(text(82.46, { decimals: 1 })).toBe("82.5");
  });

  it("uses the locale separators", () => {
    expect(text(1234567.5, { decimals: 1, decimalSeparator: ",", groupSeparator: "." })).toBe(
      "1.234.567,5",
    );
    expect(text(999, { groupSeparator: "," })).toBe("999");
    expect(text(1000, { groupSeparator: "," })).toBe("1,000");
  });

  it("shows the number as given when decimals is omitted", () => {
    expect(text(12.25)).toBe("12.25");
  });

  it("signs negatives with a true minus, but not a rounded zero", () => {
    expect(text(-0.8, { decimals: 1 })).toBe("−0.8");
    expect(text(-0.01, { decimals: 1 })).toBe("0.0");
  });

  it("reads non-finite input as zero", () => {
    expect(text(Number.NaN)).toBe("0");
    expect(text(Number.POSITIVE_INFINITY)).toBe("0");
  });

  it("keys columns by place so 99 to 100 keeps the existing digits", () => {
    const before = tokenizeNumber(99).map((token) => token.key);
    const after = tokenizeNumber(100).map((token) => token.key);
    expect(before).toEqual(["i1", "i0"]);
    expect(after).toEqual(["i2", "i1", "i0"]);
  });

  it("returns digit values per column", () => {
    const digits = tokenizeNumber(305).flatMap((token) =>
      token.kind === "digit" ? [token.digit] : [],
    );
    expect(digits).toEqual([3, 0, 5]);
  });
});
