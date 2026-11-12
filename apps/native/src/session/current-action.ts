import {
  SET_FIELDS,
  sessionTotals,
  type ExerciseType,
  type Ghosts,
  type SetField,
  type SetKind,
  type WeightUnit,
} from "@workspace/shared";
import type { SessionDetail, SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";

import { blocksOf } from "./blocks";
import { elapsedSeconds } from "./clock";
import { timerTarget } from "./duration-timer";
import { restView, type RestView } from "./rest-rules";
import { formatCell, loggedSetsOf, valueOfSet } from "./set-values";

/** One value of the current set as the Timer shows it. */
export type DisplayValue = {
  field: SetField;
  value: number | null;
  /** The value is a Ghost (nothing typed yet), not typed. */
  ghost: boolean;
};

/** The set to log now. */
export type CurrentSet = {
  exerciseRowId: string;
  exerciseId: string;
  title: string;
  type: ExerciseType;
  setId: string;
  kind: SetKind;
  /** The kinds of all the exercise's sets, for the set chips (warm-up letter, working number). */
  kinds: SetKind[];
  /** 0-based place among the exercise's sets. */
  index: number;
  /** All sets of the exercise. */
  total: number;
  /** Typed values, else Ghost values, in the order the exercise records them. */
  values: DisplayValue[];
  /** No value, typed or ghost, in any cell: Complete set has nothing to log. */
  empty: boolean;
  /** A running duration timer on this set (see `timerTarget` for its countdown). */
  timer: { startedAt: string; target: number | null } | null;
};

/** What comes after the current set: another exercise's title, or the next set of the same one. */
export type NextItem =
  | { kind: "exercise"; title: string }
  | { kind: "set"; /** 1-based. */ number: number };

export type CurrentAction = {
  /** "rest" while a Rest is running, else "work". */
  phase: "rest" | "work";
  /** The set to log; null when every set is ticked (or there are none). */
  current: CurrentSet | null;
  next: NextItem | null;
  setsDone: number;
  setsTotal: number;
  /** Every set is ticked and there is at least one. */
  allDone: boolean;
  /** The running Rest, null in the work phase. */
  rest: RestView | null;
  /** When the current stretch of work began (ISO): the end of the last Rest, else the last tick, else the start. */
  workStartedAt: string;
};

type Ordered = { exercise: SessionExerciseDetail; set: SessionSetDetail; index: number };

/**
 * Every set in the order they are logged: block by block as the accordion has them; a lone
 * exercise top to bottom; a superset by rounds (A1, B1, A2, B2 …), a member with fewer sets
 * sitting out the later rounds (the same rule as `highlightOf`).
 */
export function orderedSets(exercises: readonly SessionExerciseDetail[]): Ordered[] {
  return blocksOf(exercises).flatMap((block) => {
    const rounds = Math.max(0, ...block.members.map((member) => member.sets.length));
    const list: Ordered[] = [];
    for (let round = 0; round < rounds; round += 1) {
      for (const exercise of block.members) {
        const set = exercise.sets[round];
        if (set) list.push({ exercise, set, index: round });
      }
    }
    return list;
  });
}

/** Typed value of each field, else the Ghost value. */
function displayValues(
  exercise: SessionExerciseDetail,
  set: SessionSetDetail,
  ghosts: Ghosts,
): DisplayValue[] {
  return SET_FIELDS[exercise.type].map((field) => {
    const typed = valueOfSet(set, field);
    if (typed !== null) return { field, value: typed, ghost: false };
    const ghost = ghosts[field] ?? null;
    return { field, value: ghost, ghost: ghost !== null };
  });
}

/**
 * The shared "what now" of a live Session, for the Timer screen and the Android notification.
 * `ghostsFor` gives the Ghost values of a set (from Previous and the plan), `now` is the clock in
 * ms. `restEndedAt` (ms) is when this screen saw a Rest end early (Skip clears the stored Rest, so
 * its end is otherwise lost): work counts from the latest of it, the stored Rest's end and the
 * last tick.
 */
export function currentAction(input: {
  session: SessionDetail;
  ghostsFor: (setId: string) => Ghosts;
  now: number;
  restEndedAt?: number | null;
}): CurrentAction {
  const { session, ghostsFor, now } = input;
  const ordered = orderedSets(session.exercises);
  const setsDone = ordered.filter((item) => item.set.completedAt !== null).length;
  const pending = ordered.filter((item) => item.set.completedAt === null);
  const first = pending[0];
  const after = pending[1];

  const rest = session.rest ? restView(session.rest, now) : null;
  const running = rest !== null && rest.running;

  const current: CurrentSet | null = first
    ? {
        exerciseRowId: first.exercise.id,
        exerciseId: first.exercise.exerciseId,
        title: first.exercise.title,
        type: first.exercise.type,
        setId: first.set.id,
        kind: first.set.kind,
        kinds: first.exercise.sets.map((item) => item.kind),
        index: first.index,
        total: first.exercise.sets.length,
        values: displayValues(first.exercise, first.set, ghostsFor(first.set.id)),
        empty: false,
        timer:
          first.set.timerStartedAt === null
            ? null
            : { startedAt: first.set.timerStartedAt, target: timerTarget(first.set) },
      }
    : null;
  if (current) current.empty = current.values.every((item) => item.value === null);

  let next: NextItem | null = null;
  if (first && after) {
    next =
      after.exercise.id === first.exercise.id
        ? { kind: "set", number: after.index + 1 }
        : { kind: "exercise", title: after.exercise.title };
  }

  // Where the stretch of work began.
  const marks = [Date.parse(session.startedAt)];
  for (const item of ordered) {
    if (item.set.completedAt !== null) marks.push(Date.parse(item.set.completedAt));
  }
  if (session.rest && !running) marks.push(Date.parse(session.rest.endsAt));
  if (input.restEndedAt) marks.push(input.restEndedAt);
  const started = Math.max(...marks.filter((mark) => !Number.isNaN(mark) && mark <= now));

  return {
    phase: running ? "rest" : "work",
    current,
    next,
    setsDone,
    setsTotal: ordered.length,
    allDone: ordered.length > 0 && pending.length === 0,
    rest: running ? rest : null,
    workStartedAt: new Date(Number.isFinite(started) ? started : now).toISOString(),
  };
}

export type SessionStats = {
  /** In kg: the counted sets' volume (`sessionTotals`). */
  volumeKg: number;
  setsDone: number;
  setsTotal: number;
  /** Whole seconds since the Session started. */
  elapsedS: number;
  /** Mean seconds between one tick and the next, breaks over `BREAK_S` left out; null below two ticks. */
  averageRestS: number | null;
};

/** A gap between two ticks longer than this is a break, not a rest. */
export const BREAK_S = 15 * 60;

/**
 * Totals for the Timer's bottom strip. Rests are not stored, so "average rest" is the average time
 * from one ticked set to the next (the rest plus the set itself), without gaps over a break.
 */
export function sessionStats(input: {
  session: SessionDetail;
  bodyweightKg: number | null;
  now: number;
}): SessionStats {
  const { session, bodyweightKg, now } = input;
  const sets = session.exercises.flatMap((exercise) => exercise.sets);
  const times = sets
    .flatMap((set) => {
      const time = set.completedAt === null ? Number.NaN : Date.parse(set.completedAt);
      return Number.isNaN(time) ? [] : [time];
    })
    .sort((a, b) => a - b);
  const gaps = times.slice(1).flatMap((time, index) => {
    const gap = (time - (times[index] ?? time)) / 1000;
    return gap > 0 && gap <= BREAK_S ? [gap] : [];
  });
  return {
    volumeKg: sessionTotals(loggedSetsOf(session), bodyweightKg).volume,
    setsDone: times.length,
    setsTotal: sets.length,
    elapsedS: elapsedSeconds(session.startedAt, now),
    averageRestS: gaps.length === 0 ? null : gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length,
  };
}

/** One value of the current set as text, in the order the exercise records them. */
export type ValuePart = { field: SetField; text: string };

/** The known values as text; weight carries `unitLabel`. Values nobody knows are left out. */
export function valueParts(
  values: readonly DisplayValue[],
  unit: WeightUnit,
  unitLabel: string,
): ValuePart[] {
  return values.flatMap((item) => {
    const cell = formatCell(item.field, item.value, unit);
    if (cell === "") return [];
    return [{ field: item.field, text: item.field === "weight" ? `${cell} ${unitLabel}` : cell }];
  });
}

/** The separator between two neighbouring parts: "×" for weight then reps, else "·". */
export function partSeparator(before: ValuePart, after: ValuePart): string {
  return before.field === "weight" && after.field === "reps" ? "×" : "·";
}

/**
 * The current set's values as a line: "80 kg × 8" for weight and reps, otherwise the values joined
 * by " · ". Empty when no value is known.
 */
export function valuesText(values: readonly DisplayValue[], unit: WeightUnit, unitLabel: string) {
  const parts = valueParts(values, unit, unitLabel);
  return parts
    .map((part, index) => {
      const before = parts[index - 1];
      return before ? `${partSeparator(before, part)} ${part.text}` : part.text;
    })
    .join(" ");
}
