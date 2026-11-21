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

import { useTranslation } from "@/platform/i18n";
import { useHideTabBar } from "@/platform/navigation/tab-action";
import { Keypad } from "@/platform/ui/keypad";
import type { KeypadKey } from "@/platform/ui/keypad-keys";
import { stepOf } from "@/platform/ui/keypad-entry";
import { usePreferences } from "@/preferences";

import {
  entryDisplay,
  nextEditorCell,
  openEntry,
  unbindTable,
  pressKey,
  pressStep,
  type EditorCell,
  type EditorEntry,
} from "./editor-entry";

/** How the keypad scrolls the screen: the current offset and a way to move it. */
export type EditorScroll = { offset: () => number; scrollTo: (y: number) => void };

type Active = { tableId: string; entry: EditorEntry; hasNext: boolean };

type EditorKeypadValue = {
  /** The key of the cell being edited, or null. */
  activeKey: string | null;
  /** What the active cell shows while it is typed into. */
  text: string;
  open: (tableId: string, key: string) => void;
  /** Registers the cells of a committed table in Next order. */
  bind: (tableId: string, cells: readonly EditorCell[]) => void;
  /** Takes a table away when it unmounts; closes the keypad if it was editing that table. */
  unbind: (tableId: string) => void;
  registerNode: (key: string) => (node: View | null) => void;
};

const EditorKeypadContext = createContext<EditorKeypadValue | null>(null);

/**
 * The keypad of the Workout editor's set tables, or null where there is none (the system keyboard
 * is asked for, or the table sits outside an {@link EditorKeypadProvider}).
 */
export function useEditorKeypad(): EditorKeypadValue | null {
  return useContext(EditorKeypadContext);
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
  const { systemKeyboard } = usePreferences().preferences.ui;
  const [active, setActive] = useState<Active | null>(null);
  const activeRef = useRef(active);
  const setCurrent = useCallback((next: Active | null) => {
    activeRef.current = next;
    setActive(next);
  }, []);
  const tables = useRef(new Map<string, readonly EditorCell[]>());
  const nodes = useRef(new Map<string, View>());
  const dock = useRef<View>(null);
  const scrollRef = useRef(scroll);
  scrollRef.current = scroll;
  useHideTabBar(active !== null);

  const cellOf = useCallback((current: Active): EditorCell | undefined => {
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
      const current = activeRef.current;
      if (current?.tableId !== tableId) return;
      const { key } = current.entry.cell;
      if (!cells.some((cell) => cell.key === key)) {
        setCurrent(null);
        return;
      }
      const hasNext = nextEditorCell(cells, key) !== null;
      if (hasNext !== current.hasNext) setCurrent({ ...current, hasNext });
    },
    [setCurrent],
  );
  const unbind = useCallback(
    (tableId: string) => {
      if (unbindTable(tables.current, activeRef.current?.tableId ?? null, tableId)) {
        setCurrent(null);
      }
    },
    [setCurrent],
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
      const current = activeRef.current;
      const cell = current && cellOf(current);
      if (!current || !cell) return;
      const result = pressKey({ ...current.entry, cell }, key);
      setCurrent({ ...current, entry: result.entry });
      if (result.write) cell.onValue(result.value);
    },
    [cellOf, setCurrent],
  );
  const onStep = useCallback(
    (direction: 1 | -1) => {
      const current = activeRef.current;
      const cell = current && cellOf(current);
      if (!current || !cell) return;
      const result = pressStep({ ...current.entry, cell }, direction);
      setCurrent({ ...current, entry: result.entry });
      cell.onValue(result.value);
    },
    [cellOf, setCurrent],
  );
  const onNext = useCallback(() => {
    const current = activeRef.current;
    if (!current) return;
    const after = nextEditorCell(tables.current.get(current.tableId) ?? [], current.entry.cell.key);
    if (after) open(current.tableId, after.key);
    else setCurrent(null);
  }, [open, setCurrent]);
  const onDone = useCallback(() => setCurrent(null), [setCurrent]);

  const value = useMemo<EditorKeypadValue | null>(
    () =>
      systemKeyboard
        ? null
        : {
            activeKey: active?.entry.cell.key ?? null,
            text: active ? entryDisplay(active.entry) : "",
            open,
            bind,
            unbind,
            registerNode,
          },
    [systemKeyboard, active, open, bind, unbind, registerNode],
  );

  const stepText = active
    ? String(
        stepOf(active.entry.cell.field, {
          unit: active.entry.cell.unit,
          equipment: active.entry.cell.equipment,
          incrementKg: active.entry.cell.incrementKg,
        }),
      )
    : "";
  return (
    <EditorKeypadContext value={value}>
      <View className="flex-1">
        <View className="flex-1">{children}</View>
        <View ref={dock} collapsable={false}>
          {active && !systemKeyboard ? (
            <Keypad
              labels={{
                point: t("session__key_point"),
                backspace: t("session__key_backspace"),
                decrease: t("session__key_decrease", { step: stepText }),
                increase: t("session__key_increase", { step: stepText }),
                next: t("session__key_next"),
                done: t("session__key_done"),
              }}
              allowPoint={
                active.entry.cell.field === "weight" || active.entry.cell.field === "distance"
              }
              hasNext={active.hasNext}
              stepText={stepText}
              accessory={
                <Text numberOfLines={1} className="font-normal flex-1 text-caption text-muted">
                  {active.entry.cell.label}
                </Text>
              }
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
