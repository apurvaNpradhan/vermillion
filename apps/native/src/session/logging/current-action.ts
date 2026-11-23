import {
  SET_FIELDS,
  type ExerciseType,
  type Ghosts,
  type SetField,
  type SetKind,
  type WeightUnit,
} from "@workspace/shared";
import type { SessionDetail, SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";

import { blocksOf, roundsOf } from "./blocks";
import { timerTarget } from "../timer/duration-timer";
import { restView, type RestView } from "../rest/rest-rules";
import { formatCell, valueOfSet } from "./set-values";

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
 * Every set in the order they are logged: block by block as the accordion has them, each block in
 * its `roundsOf` order (a superset's warm-up rounds, then its work rounds).
 */
export function orderedSets(exercises: readonly SessionExerciseDetail[]): Ordered[] {
  return blocksOf(exercises).flatMap((block) => roundsOf(block).flat());
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

/** One value of the current set as text, in the order the exercise records them. */
export type ValuePart = { field: SetField; text: string };

/** The known values as text; weight carries `unitLabel`. Values nobody knows are left out. */
export function valueParts(
  values: readonly DisplayValue[],
  unit: WeightUnit,
  unitLabel: string,
  type?: ExerciseType,
): ValuePart[] {
  return values.flatMap((item) => {
    const cell = formatCell(item.field, item.value, unit, type);
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
export function valuesText(
  values: readonly DisplayValue[],
  unit: WeightUnit,
  unitLabel: string,
  type?: ExerciseType,
) {
  const parts = valueParts(values, unit, unitLabel, type);
  return parts
    .map((part, index) => {
      const before = parts[index - 1];
      return before ? `${partSeparator(before, part)} ${part.text}` : part.text;
    })
    .join(" ");
}
