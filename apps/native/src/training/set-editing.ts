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

/** Fields edited together, so a range never ends up with its two ends from different sets. */
const FIELDS: readonly {
  keys: readonly (keyof Target)[];
  patch: (from: PlannedSet) => Partial<Target>;
}[] = [
  {
    keys: ["reps_min", "reps_max"],
    patch: (s) => ({ reps_min: s.reps_min, reps_max: s.reps_max }),
  },
  {
    keys: ["effort_min", "effort_max"],
    patch: (s) => ({ effort_min: s.effort_min, effort_max: s.effort_max }),
  },
  { keys: ["weight_kg"], patch: (s) => ({ weight_kg: s.weight_kg }) },
  { keys: ["duration_s"], patch: (s) => ({ duration_s: s.duration_s }) },
  { keys: ["distance_m"], patch: (s) => ({ distance_m: s.distance_m }) },
  { keys: ["floors"], patch: (s) => ({ floors: s.floors }) },
  { keys: ["steps"], patch: (s) => ({ steps: s.steps }) },
];

/**
 * Edits one set and carries the change down: every LATER set of the same kind whose value of the
 * edited field equalled the edited set's old value gets the new value. A 3 x 10 changed on set 1
 * to 8 becomes 8, 8, 8; changed on set 3 alone it changes only set 3.
 */
export function editTarget(
  sets: readonly PlannedSet[],
  index: number,
  change: Partial<Target>,
): PlannedSet[] {
  const edited = sets[index];
  if (edited === undefined) return [...sets];
  const updated = withTarget(edited, change);
  const touched = FIELDS.filter((field) => field.keys.some((key) => key in change));
  return sets.map((set, at) => {
    if (at === index) return updated;
    if (at < index || set.kind !== edited.kind) return set;
    return touched.reduce(
      (next, field) =>
        field.keys.every((key) => set[key] === edited[key])
          ? withTarget(next, field.patch(updated))
          : next,
      set,
    );
  });
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
  const last = [...sets].reverse().find((set) => set.kind !== "warmup");
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
