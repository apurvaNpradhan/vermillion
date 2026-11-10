import { describe, expect, it } from "vitest";

import { keypadKeyOf, keypadNavOf } from "./keypad-keys";

describe("hardware keys", () => {
  it("maps digits, point, backspace, Tab and Enter and ignores the rest", () => {
    expect(keypadKeyOf("7")).toBe("7");
    expect(keypadKeyOf(",")).toBe(".");
    expect(keypadKeyOf("Backspace")).toBe("backspace");
    expect(keypadKeyOf("a")).toBeNull();
    expect(keypadKeyOf("10")).toBeNull();
    expect(keypadNavOf("Tab")).toBe("next");
    expect(keypadNavOf("Enter")).toBe("done");
    expect(keypadNavOf("a")).toBeNull();
  });
});
