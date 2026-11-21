import { describe, expect, it } from "vitest";

import {
  entryDisplay,
  nextEditorCell,
  openEntry,
  pressKey,
  pressStep,
  unbindTable,
  type EditorCell,
  type EditorEntry,
} from "./editor-entry";

const cell = (over: Partial<EditorCell> = {}): EditorCell => ({
  key: "a:weight",
  field: "weight",
  label: "Set 1 weight",
  value: undefined,
  unit: "kg",
  equipment: "barbell",
  incrementKg: null,
  onValue: () => undefined,
  ...over,
});

const keys = (start: EditorEntry, presses: Parameters<typeof pressKey>[1][]) =>
  presses.reduce((entry, key) => pressKey(entry, key).entry, start);

describe("editor keypad entry", () => {
  it("opens on the planned value and the first key replaces it", () => {
    const open = openEntry(cell({ value: 80 }));
    expect(open.raw).toBe("80");
    const after = pressKey(open, "6");
    expect(after.entry.raw).toBe("6");
    expect(after.value).toBe(6);
  });

  it("types a weight with a decimal point and writes each valid value", () => {
    const end = keys(openEntry(cell()), ["6", "0", ".", "5"]);
    expect(end.raw).toBe("60.5");
    expect(pressKey(end, ".").write).toBe(false);
  });

  it("clears the target when the text is emptied", () => {
    const open = openEntry(cell({ value: 80 }));
    expect(pressKey(open, "backspace")).toMatchObject({ write: true, value: undefined });
  });

  it("reads a duration like a microwave", () => {
    const end = keys(openEntry(cell({ field: "duration", key: "a:duration" })), ["1", "3", "0"]);
    expect(entryDisplay(end)).toBe("1:30");
    expect(pressKey(end, "0").value).toBe(13 * 60);
  });

  it("steps a weight by the equipment's step or the manual increment", () => {
    expect(pressStep(openEntry(cell({ value: 100 })), 1).value).toBe(102.5);
    expect(pressStep(openEntry(cell({ value: 100, equipment: "machine" })), -1).value).toBe(99);
    expect(pressStep(openEntry(cell({ value: 100, incrementKg: 1.25 })), 1).value).toBe(101.25);
    expect(pressStep(openEntry(cell()), 1).value).toBe(2.5);
  });

  it("continues from what is typed when stepping", () => {
    const typed = keys(openEntry(cell({ value: 50 })), ["8", "0"]);
    expect(pressStep(typed, 1).value).toBe(82.5);
  });

  it("walks to the next cell and stops at the end", () => {
    const cells = [
      cell({ key: "a:weight" }),
      cell({ key: "a:duration" }),
      cell({ key: "b:weight" }),
    ];
    expect(nextEditorCell(cells, "a:weight")?.key).toBe("a:duration");
    expect(nextEditorCell(cells, "b:weight")).toBeNull();
    expect(nextEditorCell(cells, "zzz")).toBeNull();
  });

  it("forgets an unmounted table and closes the keypad only when it was editing it", () => {
    const tables = new Map<string, readonly EditorCell[]>([
      ["t1", [cell({ key: "a:weight" })]],
      ["t2", [cell({ key: "b:weight" })]],
    ]);
    expect(unbindTable(tables, "t1", "t1")).toBe(true);
    expect([...tables.keys()]).toEqual(["t2"]);
    expect(unbindTable(tables, "t2", "t1")).toBe(false);
    expect(unbindTable(tables, null, "t2")).toBe(false);
    expect(tables.size).toBe(0);
  });
});
