import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Text, View } from "react-native";
import { useStore } from "zustand";

import { useTranslation } from "@/platform/i18n";
import { useHideTabBar } from "@/platform/navigation/tab-action";
import { Keypad } from "@/platform/ui/keypad";
import type { KeypadKey } from "@/platform/ui/keypad-keys";
import { stepOf } from "@/platform/ui/keypad-entry";
import { usePreference } from "@/preferences";

import {
  nextEditorCell,
  openEntry,
  unbindTable,
  pressKey,
  pressStep,
  type EditorCell,
} from "./editor-entry";
import {
  cellText,
  createEditorKeypadStore,
  type ActiveCell,
  type EditorKeypadStore,
} from "./editor-keypad-store";

/** How the keypad scrolls the screen: the current offset and a way to move it. */
export type EditorScroll = { offset: () => number; scrollTo: (y: number) => void };

/**
 * What the context holds. Every member is stable for the life of the provider: what changes on
 * each keystroke lives in `store`, which a cell reads through a selector ({@link useCellText}).
 */
type EditorKeypadValue = {
  store: EditorKeypadStore;
  open: (tableId: string, key: string) => void;
  /** Registers the cells of a committed table in Next order. */
  bind: (tableId: string, cells: readonly EditorCell[]) => void;
  /** Takes a table away when it unmounts; closes the keypad if it was editing that table. */
  unbind: (tableId: string) => void;
  registerNode: (key: string) => (node: View | null) => void;
};

const EditorKeypadContext = createContext<EditorKeypadValue | null>(null);

/** Read by cells outside a keypad, so the hook below always has a store to select from. */
const idleStore = createEditorKeypadStore();

/**
 * The keypad of the Workout editor's set tables, or null where there is none (the system keyboard
 * is asked for, or the table sits outside an {@link EditorKeypadProvider}).
 */
export function useEditorKeypad(): EditorKeypadValue | null {
  return useContext(EditorKeypadContext);
}

/**
 * What the cell `key` shows while it is typed into, or null while it is not edited. Only the
 * edited cell's result changes on a keystroke, so only that cell re-renders.
 */
export function useCellText(keypad: EditorKeypadValue | null, key: string): string | null {
  return useStore(keypad?.store ?? idleStore, (state) => cellText(state, key));
}

/** Two frames: the layout of the current render is committed. */
function afterLayout(run: () => void): () => void {
  let second = 0;
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(run);
  });
  return () => {
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
  };
}

/**
 * Wraps a screen that holds set tables: gives them one docked keypad at the bottom of the screen
 * (in the layout, so the page above shrinks and scrolls clear of it), hides the tab bar while it
 * is open, and scrolls the edited cell above it. With "Use system keyboard" on it provides
 * nothing and the tables keep their text inputs.
 */
export function EditorKeypadProvider({
  scroll,
  children,
}: {
  scroll: EditorScroll;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const systemKeyboard = usePreference((preferences) => preferences.ui.systemKeyboard);
  const [store] = useState(createEditorKeypadStore);
  const setCurrent = useCallback(
    (next: ActiveCell | null) => store.setState({ active: next }),
    [store],
  );
  const tables = useRef(new Map<string, readonly EditorCell[]>());
  const nodes = useRef(new Map<string, View>());
  const dock = useRef<View>(null);
  const scrollRef = useRef(scroll);
  scrollRef.current = scroll;
  const hasActiveCell = useStore(store, (state) => state.active !== null);
  const showDock = hasActiveCell && !systemKeyboard;
  useHideTabBar(showDock);

  const cellOf = useCallback((current: ActiveCell): EditorCell | undefined => {
    // The newest cell of the table: its value callback closes over the newest sets.
    return tables.current.get(current.tableId)?.find((cell) => cell.key === current.entry.cell.key);
  }, []);

  const reveal = useCallback((key: string) => {
    return afterLayout(() => {
      const node = nodes.current.get(key);
      const bar = dock.current;
      if (!node || !bar) return;
      node.measureInWindow((_x, y, _width, height) => {
        bar.measureInWindow((_dx, dockTop) => {
          const over = y + height - (dockTop - 12);
          if (over > 0) scrollRef.current.scrollTo(scrollRef.current.offset() + over);
        });
      });
    });
  }, []);

  const open = useCallback(
    (tableId: string, key: string) => {
      const cells = tables.current.get(tableId) ?? [];
      const cell = cells.find((candidate) => candidate.key === key);
      if (!cell) return;
      setCurrent({ tableId, entry: openEntry(cell), hasNext: nextEditorCell(cells, key) !== null });
      reveal(key);
    },
    [setCurrent, reveal],
  );
  const bind = useCallback(
    (tableId: string, cells: readonly EditorCell[]) => {
      tables.current.set(tableId, cells);
      const current = store.getState().active;
      if (current?.tableId !== tableId) return;
      const { key } = current.entry.cell;
      if (!cells.some((cell) => cell.key === key)) {
        setCurrent(null);
        return;
      }
      const hasNext = nextEditorCell(cells, key) !== null;
      if (hasNext !== current.hasNext) setCurrent({ ...current, hasNext });
    },
    [store, setCurrent],
  );
  const unbind = useCallback(
    (tableId: string) => {
      if (unbindTable(tables.current, store.getState().active?.tableId ?? null, tableId)) {
        setCurrent(null);
      }
    },
    [store, setCurrent],
  );
  const registerNode = useCallback(
    (key: string) => (node: View | null) => {
      if (node) nodes.current.set(key, node);
      else nodes.current.delete(key);
    },
    [],
  );

  const onKey = useCallback(
    (key: KeypadKey) => {
      const current = store.getState().active;
      const cell = current && cellOf(current);
      if (!current || !cell) return;
      const result = pressKey({ ...current.entry, cell }, key);
      setCurrent({ ...current, entry: result.entry });
      if (result.write) cell.onValue(result.value);
    },
    [store, cellOf, setCurrent],
  );
  const onStep = useCallback(
    (direction: 1 | -1) => {
      const current = store.getState().active;
      const cell = current && cellOf(current);
      if (!current || !cell) return;
      const result = pressStep({ ...current.entry, cell }, direction);
      setCurrent({ ...current, entry: result.entry });
      cell.onValue(result.value);
    },
    [store, cellOf, setCurrent],
  );
  const onNext = useCallback(() => {
    const current = store.getState().active;
    if (!current) return;
    const after = nextEditorCell(tables.current.get(current.tableId) ?? [], current.entry.cell.key);
    if (after) open(current.tableId, after.key);
    else setCurrent(null);
  }, [store, open, setCurrent]);
  const onDone = useCallback(() => setCurrent(null), [setCurrent]);

  const value = useMemo<EditorKeypadValue | null>(
    () => (systemKeyboard ? null : { store, open, bind, unbind, registerNode }),
    [systemKeyboard, store, open, bind, unbind, registerNode],
  );

  return (
    <EditorKeypadContext value={value}>
      <View className="flex-1">
        <View className="flex-1">{children}</View>
        <View ref={dock} collapsable={false}>
          {showDock ? (
            <KeypadDock
              store={store}
              labels={{
                point: t("session__key_point"),
                backspace: t("session__key_backspace"),
                next: t("session__key_next"),
                done: t("session__key_done"),
              }}
              onKey={onKey}
              onStep={onStep}
              onNext={onNext}
              onDone={onDone}
            />
          ) : null}
        </View>
      </View>
    </EditorKeypadContext>
  );
}

/** The docked keypad: reads the edited cell's field, label and step, never what is typed. */
function KeypadDock({
  store,
  labels,
  onKey,
  onStep,
  onNext,
  onDone,
}: {
  store: EditorKeypadStore;
  labels: { point: string; backspace: string; next: string; done: string };
  onKey: (key: KeypadKey) => void;
  onStep: (direction: 1 | -1) => void;
  onNext: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const field = useStore(store, (state) => state.active?.entry.cell.field ?? null);
  const label = useStore(store, (state) => state.active?.entry.cell.label ?? "");
  const hasNext = useStore(store, (state) => state.active?.hasNext ?? false);
  const stepText = useStore(store, (state) => {
    const cell = state.active?.entry.cell;
    if (!cell) return "";
    return String(
      stepOf(cell.field, {
        unit: cell.unit,
        equipment: cell.equipment,
        incrementKg: cell.incrementKg,
      }),
    );
  });
  if (field === null) return null;
  return (
    <Keypad
      labels={{
        ...labels,
        decrease: t("session__key_decrease", { step: stepText }),
        increase: t("session__key_increase", { step: stepText }),
      }}
      allowPoint={field === "weight" || field === "distance"}
      hasNext={hasNext}
      stepText={stepText}
      accessory={
        <Text numberOfLines={1} className="font-normal flex-1 text-caption text-muted">
          {label}
        </Text>
      }
      onKey={onKey}
      onStep={onStep}
      onNext={onNext}
      onDone={onDone}
    />
  );
}

/** Keeps a table's cells bound to the keypad, newest render first. */
export function useBindEditorCells(tableId: string, cells: readonly EditorCell[]) {
  const keypad = useEditorKeypad();
  const bind = keypad?.bind;
  const unbind = keypad?.unbind;
  // Layout effect: before any press that follows this render can read the cells.
  useLayoutEffect(() => {
    bind?.(tableId, cells);
  });
  // A collapsed exercise unmounts its table: its cells leave Next's order and its keypad closes.
  useLayoutEffect(() => () => unbind?.(tableId), [unbind, tableId]);
}
