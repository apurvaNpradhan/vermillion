import {
  OVERRIDE_PROMPTS_MAX,
  progresses,
  type OverridePrompt,
  type OverridePromptKind,
  type PlannedSet,
  type RepRange,
  type SetKind,
  type SetOutcome,
} from "@workspace/shared";

/** How many different Sessions must make the same override before we ask. */
export const OVERRIDE_PROMPT_AFTER = 2;
/** Two loads this close (in kilograms) are the same step. */
const SAME_STEP_KG = 0.01;

/** The step prompt is remembered per gym and exercise: another gym's stack can step differently. */
export const stepPromptKey = (gymId: string, exerciseId: string) => `${gymId}:${exerciseId}:step`;

/**
 * The range prompt is remembered per Workout exercise: the range lives in the Workout, whatever
 * gym it was trained at.
 */
export const rangePromptKey = (workoutExerciseId: string) => `${workoutExerciseId}:range`;

/**
 * What one logged progressing set says about a suggestion. `null` says nothing (no step was
 * suggested, or the lifter went below the last load). "followed" resets the count. A value is the
 * step in kilograms, or the rep count, that was chosen instead.
 */
export type Observation = { value: number; range?: RepRange } | "followed" | null;

/**
 * The step the lifter took when the suggestion added `changeKg`: "Add 2.5" followed by a logged
 * jump of 5 reads as 5. Only a load the engine raised is a step signal.
 */
export function observeStep(input: {
  suggestedKg: number;
  loggedKg: number;
  outcome: Pick<SetOutcome, "reason" | "changeKg"> | null;
}): Observation {
  const { suggestedKg, loggedKg, outcome } = input;
  if (outcome?.reason !== "add_weight" || outcome.changeKg === undefined) return null;
  const step = loggedKg - (suggestedKg - outcome.changeKg);
  if (Math.abs(step - outcome.changeKg) < SAME_STEP_KG) return "followed";
  return step > SAME_STEP_KG ? { value: step } : null;
}

/** What observing the rep range needs of a set: its kind, whether it is ticked, reps and target. */
export type RangeSet = {
  kind: SetKind;
  completed: boolean;
  reps: number | null;
  target: PlannedSet | null;
};

/**
 * Whether the Session beat the planned rep range, read once every progressing set that has a range
 * (the minimum below the maximum) is ticked: when most of the sets on the commonest range ended
 * above its top, the lowest of those counts is the reps kept (14, 15, 14, 15 on 8 to 12 reads 14).
 * Fewer above than that follows the plan. `null` while sets are still open, or with no range.
 */
export function observeRepRange(sets: readonly RangeSet[]): Observation {
  const ranged = sets.flatMap(({ kind, completed, reps, target }) => {
    const min = target?.reps_min;
    const max = target?.reps_max;
    return progresses(kind) && min !== undefined && max !== undefined && min < max
      ? [{ completed, reps, min, max }]
      : [];
  });
  if (ranged.length === 0 || ranged.some(({ completed, reps }) => !completed || reps === null))
    return null;
  const groups = new Map<string, typeof ranged>();
  for (const set of ranged) {
    const key = `${set.min}-${set.max}`;
    groups.set(key, [...(groups.get(key) ?? []), set]);
  }
  const group = [...groups.values()].reduce((best, next) =>
    next.length > best.length ? next : best,
  );
  const first = group[0];
  if (!first) return null;
  const above = group.flatMap(({ reps, max }) => (reps !== null && reps > max ? [reps] : []));
  return above.length * 2 > group.length
    ? { value: Math.min(...above), range: { min: first.min, max: first.max } }
    : "followed";
}

/** Steps are the same within a hair; rep counts within a rep, since sets rarely agree exactly. */
const same = (kind: OverridePromptKind, a: number, b: number) =>
  kind === "step" ? Math.abs(a - b) < SAME_STEP_KG : Math.abs(a - b) <= 1;

/**
 * Keeps the newest `OVERRIDE_PROMPTS_MAX` entries, but loses an open count before a dismissal: a
 * question that was answered or refused must not come back because other prompts crowded it out.
 */
function bounded(prompts: readonly OverridePrompt[]): OverridePrompt[] {
  const kept = [...prompts];
  while (kept.length > OVERRIDE_PROMPTS_MAX) {
    const open = kept.findIndex(({ dismissed }) => !dismissed);
    kept.splice(open < 0 ? 0 : open, 1);
  }
  return kept;
}

/**
 * What the step and range prompts remember after a working set was logged. The same override in
 * `OVERRIDE_PROMPT_AFTER` different Sessions asks once; following the suggestion forgets the
 * count. Two sets of one Session count once, and a dismissed prompt stays dismissed. Null when
 * nothing changes.
 */
export function noteOverride(
  prompts: readonly OverridePrompt[],
  input: {
    key: string;
    kind: OverridePromptKind;
    sessionId: string;
    observation: Observation;
  },
): OverridePrompt[] | null {
  const { key, kind, sessionId, observation } = input;
  if (observation === null) return null;
  const current = prompts.find((prompt) => prompt.key === key);
  if (current?.dismissed || current?.sessionId === sessionId) return null;
  const others = prompts.filter((prompt) => prompt.key !== key);
  if (observation === "followed") return current ? others : null;
  const range = observation.range;
  const continues =
    current !== undefined &&
    same(kind, current.value, observation.value) &&
    current.rangeMin === range?.min &&
    current.rangeMax === range?.max;
  const next: OverridePrompt = {
    key,
    kind,
    // The lower of two near-equal counts, so the range is never moved past what was reliably done.
    value: continues ? Math.min(current.value, observation.value) : observation.value,
    count: continues ? Math.min(current.count + 1, OVERRIDE_PROMPT_AFTER) : 1,
    sessionId,
    dismissed: false,
    ...(range ? { rangeMin: range.min, rangeMax: range.max } : {}),
  };
  return bounded([...others, next]);
}

/** Where a prompt is asked: the Session, and what its key is made of. */
export type PromptPlace = {
  sessionId: string;
  exerciseId: string;
  gymId: string | null;
  workoutExerciseId: string | null;
};

/**
 * The prompt to ask now: made in this Session, for this exercise, still open, and one that would
 * actually show (`renders`), so a step question that cannot be asked here never hides the range
 * question behind it. The step comes before the range.
 */
export function pendingOverridePrompt(
  prompts: readonly OverridePrompt[],
  place: PromptPlace,
  renders: (prompt: OverridePrompt) => boolean = () => true,
): OverridePrompt | undefined {
  const keys = [
    place.gymId === null ? null : stepPromptKey(place.gymId, place.exerciseId),
    place.workoutExerciseId === null ? null : rangePromptKey(place.workoutExerciseId),
  ];
  for (const key of keys) {
    if (key === null) continue;
    const found = prompts.find(
      (prompt) =>
        prompt.key === key &&
        prompt.sessionId === place.sessionId &&
        !prompt.dismissed &&
        prompt.count >= OVERRIDE_PROMPT_AFTER &&
        renders(prompt),
    );
    if (found) return found;
  }
  return undefined;
}

/** Answered or dismissed: it never asks again for that key. It goes to the end, kept longest. */
export function dismissOverridePrompt(
  prompts: readonly OverridePrompt[],
  key: string,
  kind: OverridePromptKind,
): OverridePrompt[] {
  const others = prompts.filter((prompt) => prompt.key !== key);
  return bounded([...others, { key, kind, value: 0, count: 0, sessionId: null, dismissed: true }]);
}
