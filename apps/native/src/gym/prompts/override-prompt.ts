import {
  OVERRIDE_PROMPTS_MAX,
  type OverridePrompt,
  type OverridePromptKind,
  type SetOutcome,
} from "@workspace/shared";

/** How many different Sessions must make the same override before we ask. */
export const OVERRIDE_PROMPT_AFTER = 2;
/** Two loads this close (in kilograms) are the same step. */
const SAME_STEP_KG = 0.01;

/** The key a prompt is remembered under: the gym, the exercise and what is being asked. */
export const overridePromptKey = (gymId: string, exerciseId: string, kind: OverridePromptKind) =>
  `${gymId}:${exerciseId}:${kind}`;

/**
 * What one logged working set says about a suggestion. `null` says nothing (no step was
 * suggested, or the lifter went below the last load). "followed" resets the count. A value is the
 * step in kilograms, or the rep count, that was chosen instead.
 */
export type Observation = { value: number } | "followed" | null;

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

/** Reps above the top of the planned range are a range signal; within it follows the plan. */
export function observeReps(input: {
  loggedReps: number | null;
  targetMax: number | null;
}): Observation {
  const { loggedReps, targetMax } = input;
  if (loggedReps === null || targetMax === null) return null;
  return loggedReps > targetMax ? { value: loggedReps } : "followed";
}

const same = (kind: OverridePromptKind, a: number, b: number) =>
  kind === "step" ? Math.abs(a - b) < SAME_STEP_KG : a === b;

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
  const count =
    current !== undefined && same(kind, current.value, observation.value)
      ? Math.min(current.count + 1, OVERRIDE_PROMPT_AFTER)
      : 1;
  const next: OverridePrompt = {
    key,
    kind,
    value: observation.value,
    count,
    sessionId,
    dismissed: false,
  };
  return [...others, next].slice(-OVERRIDE_PROMPTS_MAX);
}

/** The prompt to ask now: made in this Session, for this gym and exercise, still open. */
export function pendingOverridePrompt(
  prompts: readonly OverridePrompt[],
  gymId: string,
  exerciseId: string,
  sessionId: string,
): OverridePrompt | undefined {
  // One question at a time: the step before the range.
  for (const kind of ["step", "range"] as const) {
    const key = overridePromptKey(gymId, exerciseId, kind);
    const found = prompts.find(
      (prompt) =>
        prompt.key === key &&
        prompt.sessionId === sessionId &&
        !prompt.dismissed &&
        prompt.count >= OVERRIDE_PROMPT_AFTER,
    );
    if (found) return found;
  }
  return undefined;
}

/** Answered or dismissed: it never asks again for that gym, exercise and kind. */
export function dismissOverridePrompt(
  prompts: readonly OverridePrompt[],
  key: string,
  kind: OverridePromptKind,
): OverridePrompt[] {
  const others = prompts.filter((prompt) => prompt.key !== key);
  return [...others, { key, kind, value: 0, count: 0, sessionId: null, dismissed: true }].slice(
    -OVERRIDE_PROMPTS_MAX,
  );
}
