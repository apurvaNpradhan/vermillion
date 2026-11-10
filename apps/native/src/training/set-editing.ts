import {
  SET_FIELDS,
  TRAINING_LIMITS,
  defaultPlannedSets,
  type ExerciseType,
  type PlannedSet,
  type SetKind,
} from "@workspace/shared";

/** A Planned set without its kind: what is aimed for. */
export type Target = Omit<PlannedSet, "kind">;

export const MAX_WARMUPS = 5;
const DEFAULT_WARMUP_REPS = 8;

export function targetOf(set: PlannedSet): Target {
  const { kind: _kind, ...target } = set;
  return target;
}

const targetKeys = (target: Target) =>
  Object.entries(target)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

export function sameTarget(a: Target, b: Target): boolean {
  return JSON.stringify(targetKeys(a)) === JSON.stringify(targetKeys(b));
}

/** Whether an exercise type records reps, so warm-ups (reps only) make sense. */
export function supportsWarmups(type: ExerciseType): boolean {
  return SET_FIELDS[type].some((field) => field === "reps");
}

/** A new warm-up after the existing warm-ups, with the first working set's reps (or 8). */
export function appendWarmup(sets: readonly PlannedSet[], type: ExerciseType): PlannedSet[] {
  const warmups = sets.filter((set) => set.kind === "warmup").length;
  if (!supportsWarmups(type) || warmups >= MAX_WARMUPS) return [...sets];
  if (sets.length >= TRAINING_LIMITS.setsPerExercise) return [...sets];
  const reps = sets.find((set) => set.kind !== "warmup")?.reps_max ?? DEFAULT_WARMUP_REPS;
  const at = sets.findIndex((set) => set.kind !== "warmup");
  const warm: PlannedSet = { kind: "warmup", reps_min: reps, reps_max: reps };
  return at === -1 ? [...sets, warm] : [...sets.slice(0, at), warm, ...sets.slice(at)];
}

/** Warm-ups are W; every training set counts, with a type suffix for drop and failure. */
export function chipTexts(sets: readonly PlannedSet[], letters: Record<SetKind, string>): string[] {
  let training = 0;
  let warmup = 0;
  const warmups = sets.filter((set) => set.kind === "warmup").length;
  return sets.map((set) => {
    if (set.kind === "warmup") {
      warmup += 1;
      return warmups > 1 ? `${letters.warmup}${warmup}` : letters.warmup;
    }
    training += 1;
    return set.kind === "working" ? String(training) : `${training}${letters[set.kind]}`;
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
  const last = [...sets].reverse().find((set) => set.kind !== "warmup");
  const target = last
    ? targetOf(last)
    : targetOf(defaultPlannedSets(type)[0] ?? { kind: "working" });
  return [...sets, { kind: "working", ...target }];
}

/** A new set of any kind: warm-ups go before the training sets, the rest copy the last one. */
export function appendSetOfKind(
  sets: readonly PlannedSet[],
  type: ExerciseType,
  kind: SetKind,
): PlannedSet[] {
  if (kind === "warmup") return appendWarmup(sets, type);
  const next = appendSet(sets, type);
  const added = next.at(-1);
  return added && next.length > sets.length ? [...sets, withKind(added, kind)] : next;
}

/** A set with another kind; the target stays. */
export function withKind(set: PlannedSet, kind: SetKind): PlannedSet {
  return { ...set, kind };
}

/** A set with some target fields changed; `undefined` clears a field (it drops out of the JSON). */
export function withTarget(set: PlannedSet, change: Partial<Target>): PlannedSet {
  return { ...set, ...change };
}
