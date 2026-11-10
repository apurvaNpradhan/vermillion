import {
  SET_FIELDS,
  TRAINING_LIMITS,
  defaultPlannedSets,
  plannedSetKeys,
  type ExerciseType,
  type PlannedSet,
  type SetKind,
} from "@workspace/shared";

/** A Planned set without its kind: what is aimed for. */
export type Target = Omit<PlannedSet, "kind">;

export const MAX_WARMUPS = 5;
export const MIN_WORKING = 1;
const DEFAULT_WARMUP_REPS = 8;

export function targetOf(set: PlannedSet): Target {
  const { kind: _kind, ...target } = set;
  return target;
}

const targetKeys = (target: Target) =>
  Object.entries(target)
    .filter(([, value]) => value !== undefined)
    .toSorted(([a], [b]) => a.localeCompare(b));

export function sameTarget(a: Target, b: Target): boolean {
  return JSON.stringify(targetKeys(a)) === JSON.stringify(targetKeys(b));
}

/** Whether an exercise type records reps, so warm-ups (reps only) make sense. */
export function supportsWarmups(type: ExerciseType): boolean {
  return SET_FIELDS[type].some((field) => field === "reps");
}

/** The shape "All sets alike" edits: a warm-up count, a working-set count and one target. */
export type AlikeModel = { warmups: number; working: number; target: Target };

/** All working sets are plain working sets with the same target (warm-ups are ignored). */
export function setsAlike(sets: readonly PlannedSet[]): boolean {
  const working = sets.filter((set) => set.kind !== "warmup");
  const first = working[0];
  if (first === undefined) return true;
  return working.every(
    (set) => set.kind === "working" && sameTarget(targetOf(set), targetOf(first)),
  );
}

/** The model of sets that are alike (call {@link setsAlike} first). */
export function alikeModel(sets: readonly PlannedSet[], type: ExerciseType): AlikeModel {
  const working = sets.filter((set) => set.kind !== "warmup");
  const first = working[0];
  return {
    warmups: sets.length - working.length,
    working: working.length,
    target: first ? targetOf(first) : targetOf(defaultPlannedSets(type)[0] ?? { kind: "working" }),
  };
}

/** Counts that keep the total within the limit: working first, then warm-ups. */
export function clampCounts(type: ExerciseType, warmups: number, working: number) {
  const w = Math.min(TRAINING_LIMITS.setsPerExercise, Math.max(MIN_WORKING, working));
  const room = TRAINING_LIMITS.setsPerExercise - w;
  const warm = supportsWarmups(type) ? Math.min(MAX_WARMUPS, room, Math.max(0, warmups)) : 0;
  return { warmups: warm, working: w };
}

/**
 * The sets for a model: warm-ups first (existing ones keep their reps, new ones copy the working
 * reps), then the working sets. Fields the type does not record are dropped.
 */
export function buildAlike(
  model: AlikeModel,
  type: ExerciseType,
  previous: readonly PlannedSet[] = [],
): PlannedSet[] {
  const counts = clampCounts(type, model.warmups, model.working);
  const allowed: ReadonlySet<string> = new Set(plannedSetKeys(type));
  const target: Target = Object.fromEntries(
    Object.entries(model.target).filter(([key, value]) => allowed.has(key) && value !== undefined),
  );
  const existing = previous.filter((set) => set.kind === "warmup");
  const reps = target.reps_max ?? DEFAULT_WARMUP_REPS;
  const warm = Array.from(
    { length: counts.warmups },
    (_, index): PlannedSet => existing[index] ?? { kind: "warmup", reps_min: reps, reps_max: reps },
  );
  const working = Array.from({ length: counts.working }, (): PlannedSet => ({
    kind: "working",
    ...target,
  }));
  return [...warm, ...working];
}

/** The chip text of each set: W for warm-up, D for drop, F for failure, 1…n for working sets. */
export function chipTexts(sets: readonly PlannedSet[], letters: Record<SetKind, string>): string[] {
  let working = 0;
  return sets.map((set) => {
    if (set.kind !== "working") return letters[set.kind];
    working += 1;
    return String(working);
  });
}

export function replaceSet(
  sets: readonly PlannedSet[],
  index: number,
  next: PlannedSet,
): PlannedSet[] {
  return sets.map((set, at) => (at === index ? next : set));
}

/** Removes a set; the last remaining set cannot be removed. */
export function removeSetAt(sets: readonly PlannedSet[], index: number): PlannedSet[] {
  return sets.length <= 1 ? [...sets] : sets.filter((_, at) => at !== index);
}

/** A new working set after the last one, copying the last working set's target. */
export function appendSet(sets: readonly PlannedSet[], type: ExerciseType): PlannedSet[] {
  if (sets.length >= TRAINING_LIMITS.setsPerExercise) return [...sets];
  const last = sets.findLast((set) => set.kind !== "warmup");
  const target = last
    ? targetOf(last)
    : targetOf(defaultPlannedSets(type)[0] ?? { kind: "working" });
  return [...sets, { kind: "working", ...target }];
}

/** A set with another kind; the target stays. */
export function withKind(set: PlannedSet, kind: SetKind): PlannedSet {
  return { ...set, kind };
}

/** A set with some target fields changed; `undefined` clears a field (it drops out of the JSON). */
export function withTarget(set: PlannedSet, change: Partial<Target>): PlannedSet {
  return { ...set, ...change };
}

/** A target with some fields changed; `undefined` clears a field. */
export function mergeTarget(target: Target, change: Partial<Target>): Target {
  return { ...target, ...change };
}
