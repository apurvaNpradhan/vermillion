import {
  SET_FIELDS,
  supersetPlaces,
  type EffortScale,
  type Ghosts,
  type SetKind,
  type WeightUnit,
} from "@workspace/shared";
import type {
  SessionDetail,
  SessionExerciseDetail,
  SessionSetDetail,
  SetPatch,
} from "@workspace/sync";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { haptic } from "@/platform/haptics";
import type { KeypadKey } from "@/platform/ui/keypad-keys";
import { useCoalescedWriter } from "@/training";

import {
  blocksOf,
  firstUnfinished,
  highlightOf,
  isBlockDone,
  nextAfter,
  type Block,
} from "./blocks";
import {
  applyKey,
  cellOrder,
  displayOfText,
  nextCell,
  stepOf,
  stepValue,
  textOfValue,
  valueOfText,
  type CellRef,
  type EntryField,
} from "./keypad-entry";
import type { PreviousSets } from "./use-previous-sets";
import type { useSessionActions } from "./use-session-actions";
import { ghostsOf, patchFor, previousOfRow, previousPatch, valueOfSet } from "./set-values";
import type { ActiveEntry, Refusal } from "./components/set-row";

type Actions = ReturnType<typeof useSessionActions>;

/** Where a set sits: its exercise, its place in it. */
type Found = { exercise: SessionExerciseDetail; set: SessionSetDetail; index: number };

/**
 * Everything the logging screen does that is not drawing: which block of the accordion is open
 * and where it goes next, the keypad's cell and what is typed into it, refused ticks, and the
 * writes. Edits show at once (the draft is the cell's text) and are saved together once typing
 * pauses; moving to another cell, Done and ticking save immediately.
 */
export function useLoggingState({
  session,
  previous,
  unit,
  effortScale,
  readOnly,
  actions,
}: {
  session: SessionDetail;
  previous: PreviousSets;
  unit: WeightUnit;
  effortScale: EffortScale;
  readOnly: boolean;
  actions: Actions;
}) {
  const exercises = session.exercises;
  const blocks = useMemo(() => blocksOf(exercises), [exercises]);
  const places = useMemo(() => {
    const list = supersetPlaces(exercises, (entry) => entry.supersetGroup);
    return new Map(exercises.map((entry, index) => [entry.id, list[index] ?? "none"] as const));
  }, [exercises]);
  const found = useMemo(() => {
    const map = new Map<string, Found>();
    for (const exercise of exercises) {
      exercise.sets.forEach((set, index) => map.set(set.id, { exercise, set, index }));
    }
    return map;
  }, [exercises]);

  // ---- The accordion ----
  const [openBlockId, setOpenBlockId] = useState<string | null | undefined>(undefined);
  const [justCollapsedId, setJustCollapsedId] = useState<string | null>(null);
  const watched = useRef<{ id: string; done: boolean } | null>(null);
  useEffect(() => {
    if (openBlockId === undefined) {
      setOpenBlockId(firstUnfinished(blocks)?.id ?? blocks[0]?.id ?? null);
      return;
    }
    if (openBlockId === null) return;
    const open = blocks.find((block) => block.id === openBlockId);
    if (!open) {
      setOpenBlockId(firstUnfinished(blocks)?.id ?? null);
      return;
    }
    const done = isBlockDone(open);
    const before = watched.current;
    watched.current = { id: open.id, done };
    // Ticking the last set of the open block collapses it and opens the next one that is not done.
    if (before?.id === open.id && !before.done && done) {
      const next = nextAfter(blocks, open.id);
      setJustCollapsedId(open.members.at(-1)?.id ?? null);
      setOpenBlockId(next?.id ?? null);
    }
  }, [blocks, openBlockId]);

  const toggleBlock = useCallback(
    (exerciseId: string) => {
      const block = blocks.find((candidate) =>
        candidate.members.some((member) => member.id === exerciseId),
      );
      if (!block) return;
      setOpenBlockId((current) => (current === block.id ? null : block.id));
      setJustCollapsedId((current) =>
        block.members.some((member) => member.id === current) ? null : current,
      );
    },
    [blocks],
  );

  const highlights = useMemo(() => {
    const map = new Map<string, string>();
    for (const block of blocks) {
      const highlight = highlightOf(block);
      if (highlight) map.set(highlight.setId, highlight.exerciseId);
    }
    return map;
  }, [blocks]);

  // ---- Previous and Ghost values ----
  const previousOf = useCallback(
    (setId: string) => {
      const at = found.get(setId);
      return at
        ? previousOfRow(previous.get(at.exercise.exerciseId), at.exercise.sets, at.index)
        : null;
    },
    [found, previous],
  );
  const ghostsFor = useCallback(
    (setId: string): Ghosts => {
      const at = found.get(setId);
      if (!at) return {};
      return ghostsOf(at.exercise.type, previousOf(setId), at.set.target, at.exercise.logEffort);
    },
    [found, previousOf],
  );

  // ---- The keypad ----
  const [entry, setEntry] = useState<{ cell: CellRef; raw: string; fresh: boolean } | null>(null);
  const entryRef = useRef(entry);
  useEffect(() => {
    entryRef.current = entry;
  });
  const writer = useCoalescedWriter((patch: { setId: string; values: SetPatch }) =>
    actions.updateValues(patch.setId, patch.values),
  );
  const activeSetId = entry?.cell.setId ?? null;

  /** Saves what is typed now, for a cell that is about to be left. */
  const flush = useCallback(() => writer.flush(), [writer]);

  const openCell = useCallback(
    (setId: string, field: EntryField) => {
      if (readOnly) return;
      flush();
      const at = found.get(setId);
      if (!at) return;
      setEntry({
        cell: { setId, field },
        raw: textOfValue(field, valueOfSet(at.set, field), unit),
        fresh: true,
      });
    },
    [readOnly, flush, found, unit],
  );
  const closeKeypad = useCallback(() => {
    flush();
    setEntry(null);
  }, [flush]);

  /** Writes a cell's value (null clears it); a ticked set must keep its values. */
  const commit = useCallback(
    (cell: CellRef, value: number | null) => {
      const at = found.get(cell.setId);
      if (!at || (value === null && at.set.completedAt !== null)) return;
      writer.queue({
        setId: cell.setId,
        // Typing a duration ends a running timer; the value is now typed.
        values: {
          ...patchFor(cell.field, value),
          ...(cell.field === "duration" ? { timer_started_at: null } : {}),
        },
      });
    },
    [found, writer],
  );

  const onKey = useCallback(
    (key: KeypadKey) => {
      const current = entryRef.current;
      if (!current) return;
      const base = current.fresh ? "" : current.raw;
      const raw =
        current.fresh && key === "backspace" ? "" : applyKey(current.cell.field, base, key, unit);
      if (raw === current.raw && !current.fresh) return;
      setEntry({ cell: current.cell, raw, fresh: false });
      commit(current.cell, valueOfText(current.cell.field, raw, unit));
    },
    [unit, commit],
  );

  const onStep = useCallback(
    (direction: 1 | -1) => {
      const current = entryRef.current;
      if (!current) return;
      const at = found.get(current.cell.setId);
      if (!at) return;
      const field = current.cell.field;
      const typed = current.fresh
        ? valueOfSet(at.set, field)
        : valueOfText(field, current.raw, unit);
      const ghost = ghostsFor(current.cell.setId)[field] ?? null;
      const next = stepValue(field, typed, ghost, direction, {
        unit,
        barbell: at.exercise.exercise?.equipment === "barbell",
      });
      setEntry({ cell: current.cell, raw: textOfValue(field, next, unit), fresh: false });
      commit(current.cell, next);
    },
    [found, unit, ghostsFor, commit],
  );

  const blockOfSet = useCallback(
    (setId: string): Block<SessionExerciseDetail> | undefined => {
      const at = found.get(setId);
      return at
        ? blocks.find((block) => block.members.some((member) => member.id === at.exercise.id))
        : undefined;
    },
    [found, blocks],
  );

  const orderOf = useCallback(
    (block: Block<SessionExerciseDetail>) =>
      cellOrder(
        block.members.map((member) => ({
          id: member.id,
          sets: member.sets.map((set) => ({
            id: set.id,
            fields: SET_FIELDS[member.type],
          })),
        })),
      ),
    [],
  );

  const next = useMemo(() => {
    if (!entry) return null;
    const block = blockOfSet(entry.cell.setId);
    return block ? nextCell(orderOf(block), entry.cell) : null;
  }, [entry, blockOfSet, orderOf]);

  const stepText = useMemo(() => {
    if (!entry) return "";
    const at = found.get(entry.cell.setId);
    return String(
      stepOf(entry.cell.field, { unit, barbell: at?.exercise.exercise?.equipment === "barbell" }),
    );
  }, [entry, found, unit]);

  const onNext = useCallback(() => {
    if (!next) return closeKeypad();
    openCell(next.setId, next.field);
  }, [next, openCell, closeKeypad]);

  // The keypad closes when its set goes away or the Session stops being editable.
  useEffect(() => {
    if (entry && (!found.has(entry.cell.setId) || readOnly)) setEntry(null);
  }, [entry, found, readOnly]);

  // ---- Ticking ----
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const refusals = useRef(0);
  const onTick = useCallback(
    async (setId: string) => {
      const at = found.get(setId);
      if (!at || readOnly) return;
      flush();
      setEntry(null);
      setRefusal(null);
      if (at.set.completedAt !== null) {
        await actions.untick(setId);
        return;
      }
      const result = await actions.tick(setId, ghostsFor(setId));
      if (result && !result.ok) {
        refusals.current += 1;
        setRefusal({ setId, fields: result.missing, nonce: refusals.current });
        haptic.alert();
      }
    },
    [found, readOnly, flush, actions, ghostsFor],
  );

  // ---- Previous, kind, add and remove ----
  const onPrevious = useCallback(
    async (setId: string) => {
      const source = previousOf(setId);
      const at = found.get(setId);
      if (!source || !at || readOnly) return;
      flush();
      await actions.updateValues(
        setId,
        previousPatch(source, at.exercise.type, at.exercise.logEffort),
      );
      setRefusal(null);
    },
    [previousOf, found, readOnly, flush, actions],
  );
  const onKindSelected = useCallback(
    (setId: string, kind: SetKind) => void actions.updateValues(setId, { kind }),
    [actions],
  );

  const addSet = useCallback(
    async (exerciseId: string) => {
      const exercise = exercises.find((candidate) => candidate.id === exerciseId);
      if (!exercise || readOnly) return;
      const last = [...exercise.sets].reverse().find((set) => set.kind !== "warmup");
      const added = await actions.addExtraSet(exerciseId, last?.target ?? null);
      if (added) {
        const block = blocks.find((candidate) =>
          candidate.members.some((member) => member.id === exerciseId),
        );
        if (block) setOpenBlockId(block.id);
        setJustCollapsedId(null);
      }
    },
    [exercises, readOnly, actions, blocks],
  );

  return {
    blocks,
    places,
    openBlockId: openBlockId ?? null,
    justCollapsedId,
    toggleBlock,
    highlights,
    previousOf,
    ghostsFor,
    unit,
    effortScale,
    // The cell being edited, as the rows draw it.
    entry: useMemo<ActiveEntry | null>(
      () =>
        entry
          ? {
              cell: entry.cell,
              text: displayOfText(entry.cell.field, entry.raw),
            }
          : null,
      [entry],
    ),
    activeSetId,
    activeField: entry?.cell.field ?? null,
    hasNext: next !== null,
    stepText,
    openCell,
    closeKeypad,
    onKey,
    onStep,
    onNext,
    refusal,
    onTick,
    onPrevious,
    onKindSelected,
    addSet,
    found,
    flush,
  };
}
