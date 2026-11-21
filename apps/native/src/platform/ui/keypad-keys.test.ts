import { describe, expect, it } from "vitest";

import { keypadKeyOf, keypadKeysOfText, keypadNavOf, keypadPressOf } from "./keypad-keys";

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

describe("typed text", () => {
  it("turns single digits into one key each", () => {
    expect(keypadKeysOfText("7", true)).toEqual(["7"]);
  });
  it("normalizes decimal commas and keeps order for a paste", () => {
    expect(keypadKeysOfText("12,5", true)).toEqual(["1", "2", ".", "5"]);
    expect(keypadKeysOfText("1 2a", true)).toEqual(["1", "2"]);
  });
  it("drops the point where the cell takes none", () => {
    expect(keypadKeysOfText("1.5,", false)).toEqual(["1", "5"]);
  });
});

describe("key presses", () => {
  it("never edits on a printable key, so Android's two events count a digit once", () => {
    expect(keypadPressOf("5")).toEqual({ edit: null, nav: null });
    expect(keypadPressOf(",")).toEqual({ edit: null, nav: null });
  });
  it("edits on Backspace and navigates on Tab and Enter", () => {
    expect(keypadPressOf("Backspace")).toEqual({ edit: "backspace", nav: null });
    expect(keypadPressOf("Tab").nav).toBe("next");
    expect(keypadPressOf("Enter").nav).toBe("done");
  });
});
