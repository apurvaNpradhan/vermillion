import { describe, expect, it } from "vitest";

import {
  applyKey,
  cellOrder,
  digitsFromDuration,
  displayOfText,
  durationFromDigits,
  nextCell,
  stepOf,
  stepValue,
  textOfValue,
  valueOfText,
  type EntryKey,
  type EntryField,
} from "./keypad-entry";

const type = (field: EntryField, keys: EntryKey[], unit: "kg" | "lb" = "kg", start = "") =>
  keys.reduce((text, key) => applyKey(field, text, key, unit), start);

describe("typing", () => {
  it("builds weights with one decimal point and two decimals at most", () => {
    expect(type("weight", ["6", "0"])).toBe("60");
    expect(type("weight", ["6", "0", ".", "5"])).toBe("60.5");
    expect(type("weight", ["6", ".", "2", "5", "5"])).toBe("6.25");
    expect(type("weight", ["6", ".", ".", "5"])).toBe("6.5");
    expect(type("weight", ["."])).toBe("0.");
    expect(type("weight", ["0", "5"])).toBe("5");
    expect(type("weight", ["0", "0"])).toBe("0");
  });

  it("refuses a weight over 1,000 kg and backspaces to empty", () => {
    expect(type("weight", ["1", "0", "0", "0"])).toBe("1000");
    // 1,001 kg is over the cap: the last key is ignored.
    expect(type("weight", ["1", "0", "0", "1"])).toBe("100");
    expect(type("weight", ["1", "backspace", "1", "0", "0", "0", "0"])).toBe("1000");
    expect(type("weight", ["6", "backspace", "backspace"])).toBe("");
    // 2,204 lb is just under 1,000 kg; 2,205 lb is over.
    expect(type("weight", ["2", "2", "0", "4"], "lb")).toBe("2204");
    expect(type("weight", ["2", "2", "0", "5"], "lb")).toBe("220");
  });

  it("keeps whole-number fields whole and within their caps", () => {
    expect(type("reps", ["1", ".", "2"])).toBe("12");
    expect(type("reps", ["9", "9", "9", "9"])).toBe("999");
    expect(type("reps", ["0"])).toBe("0");
    expect(type("reps", ["0", "8"])).toBe("8");
    expect(type("floors", ["1", "0", "0", "0", "0"])).toBe("10000");
    expect(type("floors", ["1", "0", "0", "0", "0", "1"])).toBe("10000");
    expect(type("steps", ["1", "0", "0", "0", "0", "0", "0"])).toBe("1000000");
    expect(type("distance", ["5", "0", ".", "5", "5"])).toBe("50.5");
  });

  it("types a duration like a microwave", () => {
    expect(type("duration", ["1", "3", "0"])).toBe("130");
    expect(durationFromDigits("130")).toBe(90);
    expect(durationFromDigits("45")).toBe(45);
    expect(durationFromDigits("1000")).toBe(600);
    expect(durationFromDigits("")).toBeNull();
    expect(durationFromDigits("0")).toBeNull();
    expect(type("duration", ["0", "0", "5"])).toBe("5");
    // 1440:00 is 24 h; one more minute is refused.
    expect(type("duration", ["1", "4", "4", "0", "0", "0"])).toBe("144000");
    expect(type("duration", ["1", "4", "4", "1", "0", "0"])).toBe("14410");
    expect(digitsFromDuration(90)).toBe("130");
    expect(digitsFromDuration(45)).toBe("45");
    expect(digitsFromDuration(600)).toBe("1000");
    expect(digitsFromDuration(5)).toBe("5");
  });

  it("reads the stored value back into text and the text into a value", () => {
    expect(textOfValue("weight", 22.5, "kg")).toBe("22.5");
    expect(textOfValue("weight", 45 * 0.45359237, "lb")).toBe("45");
    expect(textOfValue("weight", null, "kg")).toBe("");
    expect(textOfValue("duration", 90, "kg")).toBe("130");
    expect(valueOfText("weight", "22.5", "kg")).toBe(22.5);
    expect(valueOfText("weight", "22.", "kg")).toBe(22);
    expect(valueOfText("weight", "", "kg")).toBeNull();
    expect(valueOfText("weight", "45", "lb")).toBeCloseTo(20.412, 3);
    expect(valueOfText("reps", "12", "kg")).toBe(12);
    expect(valueOfText("reps", "0", "kg")).toBeNull();
    expect(valueOfText("distance", "0", "kg")).toBe(0);
    expect(valueOfText("duration", "130", "kg")).toBe(90);
  });
});

describe("what a cell shows while typing", () => {
  it("formats a duration and leaves the rest as typed", () => {
    expect(displayOfText("duration", "130")).toBe("1:30");
    expect(displayOfText("duration", "")).toBe("");
    expect(displayOfText("weight", "60.")).toBe("60.");
    expect(displayOfText("reps", "8")).toBe("8");
  });
});

describe("steps", () => {
  it("uses 2.5 kg / 5 lb on a barbell and 1 kg / 2.5 lb otherwise", () => {
    expect(stepOf("weight", { unit: "kg", barbell: true })).toBe(2.5);
    expect(stepOf("weight", { unit: "lb", barbell: true })).toBe(5);
    expect(stepOf("weight", { unit: "kg", barbell: false })).toBe(1);
    expect(stepOf("weight", { unit: "lb", barbell: false })).toBe(2.5);
    expect(stepOf("reps", { unit: "kg", barbell: true })).toBe(1);
  });

  it("steps a weight from its value, else its Ghost, else zero, never below zero", () => {
    const bar = { unit: "kg", barbell: true } as const;
    expect(stepValue("weight", 100, null, 1, bar)).toBe(102.5);
    expect(stepValue("weight", 100, 90, -1, bar)).toBe(97.5);
    expect(stepValue("weight", null, 90, 1, bar)).toBe(92.5);
    expect(stepValue("weight", null, null, 1, bar)).toBe(2.5);
    expect(stepValue("weight", 1, null, -1, bar)).toBe(0);
    expect(stepValue("weight", 0, null, -1, bar)).toBe(0);
    // Off-grid weights snap to the step.
    expect(stepValue("weight", 101, null, 1, bar)).toBe(102.5);
    expect(stepValue("weight", 20, null, 1, { unit: "kg", barbell: false })).toBe(21);
  });

  it("steps pounds in pounds and stores kilograms", () => {
    const kg = 135 * 0.45359237;
    const next = stepValue("weight", kg, null, 1, { unit: "lb", barbell: true });
    expect(next / 0.45359237).toBeCloseTo(140, 2);
  });

  it("keeps reps, duration and the rest in their ranges", () => {
    const any = { unit: "kg", barbell: false } as const;
    expect(stepValue("reps", 8, null, 1, any)).toBe(9);
    expect(stepValue("reps", 1, null, -1, any)).toBe(1);
    expect(stepValue("reps", null, 5, 1, any)).toBe(6);
    expect(stepValue("reps", 999, null, 1, any)).toBe(999);
    expect(stepValue("duration", 30, null, 1, any)).toBe(35);
    expect(stepValue("duration", 3, null, -1, any)).toBe(1);
    expect(stepValue("distance", 100, null, 1, any)).toBe(110);
    expect(stepValue("distance", 5, null, -1, any)).toBe(0);
  });
});

describe("Next", () => {
  const set = (id: string, fields: EntryField[] = ["weight", "reps"]) => ({ id, fields });

  it("walks weight, reps, then the next set's weight, and stops at the end", () => {
    const cells = cellOrder([{ id: "a", sets: [set("a1"), set("a2")] }]);
    expect(cells.map((cell) => `${cell.setId}:${cell.field}`)).toEqual([
      "a1:weight",
      "a1:reps",
      "a2:weight",
      "a2:reps",
    ]);
    expect(nextCell(cells, { setId: "a1", field: "weight" })).toEqual({
      setId: "a1",
      field: "reps",
    });
    expect(nextCell(cells, { setId: "a1", field: "reps" })).toEqual({
      setId: "a2",
      field: "weight",
    });
    expect(nextCell(cells, { setId: "a2", field: "reps" })).toBeNull();
    expect(nextCell(cells, { setId: "zz", field: "reps" })).toBeNull();
  });

  it("follows the rounds of a superset", () => {
    const cells = cellOrder([
      { id: "a", sets: [set("a1"), set("a2")] },
      { id: "b", sets: [set("b1", ["reps"])] },
    ]);
    expect(cells.map((cell) => `${cell.setId}:${cell.field}`)).toEqual([
      "a1:weight",
      "a1:reps",
      "b1:reps",
      "a2:weight",
      "a2:reps",
    ]);
  });
});
