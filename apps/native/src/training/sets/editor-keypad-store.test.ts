import { describe, expect, it } from "vitest";

import { cellText, createEditorKeypadStore } from "./editor-keypad-store";
import { openEntry, pressKey, type EditorCell } from "./editor-entry";

const cell = (key: string): EditorCell => ({
  key,
  field: "weight",
  label: key,
  value: undefined,
  unit: "kg",
  equipment: "barbell",
  incrementKg: 2.5,
  onValue: () => undefined,
});

/** Subscribes the way a cell does and records each time its selected value changes. */
function watchCell(store: ReturnType<typeof createEditorKeypadStore>, key: string) {
  const seen: (string | null)[] = [cellText(store.getState(), key)];
  store.subscribe((state) => {
    const next = cellText(state, key);
    if (!Object.is(next, seen[seen.length - 1])) seen.push(next);
  });
  return seen;
}

describe("editor keypad store", () => {
  it("starts with nothing active", () => {
    const store = createEditorKeypadStore();
    expect(cellText(store.getState(), "a")).toBeNull();
  });

  it("shows text only in the cell being edited", () => {
    const store = createEditorKeypadStore();
    const a = cell("a");
    const entry = pressKey(openEntry(a), "5").entry;
    store.setState({ active: { tableId: "t", entry, hasNext: true } });
    expect(cellText(store.getState(), "a")).toBe("5");
    expect(cellText(store.getState(), "b")).toBeNull();
  });

  it("a keystroke changes the selected value of the edited cell only", () => {
    const store = createEditorKeypadStore();
    const a = cell("a");
    const b = cell("b");
    store.setState({ active: { tableId: "t", entry: openEntry(a), hasNext: true } });
    const seenA = watchCell(store, "a");
    const seenB = watchCell(store, "b");
    const first = pressKey(openEntry(a), "1");
    store.setState({ active: { tableId: "t", entry: first.entry, hasNext: true } });
    store.setState({
      active: { tableId: "t", entry: pressKey(first.entry, "2").entry, hasNext: true },
    });
    expect(seenA.length).toBe(3);
    expect(seenA[seenA.length - 1]).toBe("12");
    expect(seenB).toEqual([null]);
    // Moving to the next cell changes both, once each.
    store.setState({ active: { tableId: "t", entry: openEntry(b), hasNext: false } });
    expect(seenB.length).toBe(2);
    expect(seenA[seenA.length - 1]).toBeNull();
  });

  it("keeps one store per provider", () => {
    const one = createEditorKeypadStore();
    const two = createEditorKeypadStore();
    one.setState({ active: { tableId: "t", entry: openEntry(cell("a")), hasNext: false } });
    expect(two.getState().active).toBeNull();
  });
});
