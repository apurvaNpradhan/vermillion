import { createStore, type StoreApi } from "zustand/vanilla";

import { entryDisplay, type EditorEntry } from "./editor-entry";

/** The cell being edited, with its table and whether Next has a cell after it. */
export type ActiveCell = { tableId: string; entry: EditorEntry; hasNext: boolean };

export type EditorKeypadState = { active: ActiveCell | null };

export type EditorKeypadStore = StoreApi<EditorKeypadState>;

/** One store per keypad provider: the editing state belongs to that screen, not to the app. */
export function createEditorKeypadStore(): EditorKeypadStore {
  return createStore<EditorKeypadState>(() => ({ active: null }));
}

/**
 * What the cell `key` shows while typed into, or null when another cell (or none) is edited. A
 * cell selects this, so a keystroke re-renders only the cell being edited.
 */
export function cellText(state: EditorKeypadState, key: string): string | null {
  const { active } = state;
  return active?.entry.cell.key === key ? entryDisplay(active.entry) : null;
}
