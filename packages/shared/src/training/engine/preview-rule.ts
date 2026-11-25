import type { LoggedSet } from "../logging/logged-set";
import { progresses, type ProgressionReason, type SetOutcome } from "../progress/progression";
import type { ContextSession } from "../progress/suggestion-context";
import type { SetKind } from "../vocabulary/vocabulary";
import { prescribe, type PrescribeInput } from "./prescribe";
import type { RuleId } from "./rule-config";

const WEEK_MS = 7 * 86_400_000;
export const RULE_PREVIEW_SESSIONS = 4;

/** What a rule will ask of one coming Session, if every set before it is made as asked. */
export type RulePreviewSession = {
  reason: ProgressionReason;
  /** What the first set that names the reason says: its change in load, its factor. */
  outcome: SetOutcome | null;
  /** The progressing sets, in order. */
  sets: { kind: SetKind; weightKg: number | null; reps: number | null }[];
};

/**
 * The next `count` Sessions a rule would prescribe if every set were done exactly as asked, a week
 * apart: Liftosaur's playground without the script. It runs the real engine over a made-up
 * history, with no phase, stall deload or snapshot. An exercise with no history starts from its
 * plan (its targets' loads at the bottom of their range); with neither there is nothing to
 * project and the list is empty.
 */
export function previewRule(
  input: PrescribeInput,
  count = RULE_PREVIEW_SESSIONS,
): RulePreviewSession[] {
  const now = input.now ?? new Date();
  const history: ContextSession[] = [...input.history];
  const entry = {
    exercise_id: input.place.exerciseId,
    session_exercise_id: "rule-preview",
    source_workout_exercise_id: input.place.sourceWorkoutExerciseId ?? null,
    exercise_type: input.place.type,
  } as const;
  const session = (
    id: string,
    at: Date,
    sets: readonly Omit<LoggedSet, "id" | "completed_at">[],
  ) => {
    const when = at.toISOString();
    return {
      id,
      workoutId: input.place.workoutId,
      gymId: input.place.gymId,
      started_at: when,
      finished_at: when,
      sets: sets.map((set, index) => ({ ...set, id: `${id}-${index}`, completed_at: when })),
    } satisfies ContextSession;
  };
  if (history.length === 0) {
    const planned = input.plan.filter((target) => progresses(target.kind));
    if (planned.length === 0 || planned.some((target) => target.reps_min === undefined)) return [];
    if (input.place.type !== "reps_only" && input.place.type !== "bodyweight_reps") {
      if (planned.some((target) => target.weight_kg === undefined)) return [];
    }
    history.unshift(
      session(
        "rule-preview-start",
        new Date(now.getTime() - WEEK_MS),
        planned.map((target) => ({
          ...entry,
          kind: target.kind,
          weight_kg: target.weight_kg ?? null,
          reps: target.reps_min ?? null,
          target,
        })),
      ),
    );
  }
  const sessions: RulePreviewSession[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = new Date(now.getTime() + index * WEEK_MS);
    const result = prescribe({
      ...input,
      history: [...history],
      now: at,
      snapshot: undefined,
      suggest: true,
      place: { ...input.place, phaseLoad: 1, stalls: false, stallDeload: false, testSingle: false },
    });
    const progression = result.progression;
    if (!progression) break;
    const sets = input.plan.flatMap((target, position) => {
      const next = progression.sets[position];
      return progresses(target.kind) && next
        ? [{ kind: target.kind, weightKg: next.weightKg, reps: next.reps }]
        : [];
    });
    if (sets.length === 0) break;
    const outcome =
      progression.outcomes.find((item) => item?.reason === progression.reason) ?? null;
    sessions.push({ reason: progression.reason, outcome, sets });
    history.unshift(
      session(
        `rule-preview-${index}`,
        at,
        input.plan.flatMap((target, position) => {
          const next = progression.sets[position];
          return progresses(target.kind) && next
            ? [
                {
                  ...entry,
                  kind: target.kind,
                  weight_kg: next.weightKg,
                  reps: next.reps,
                  target,
                },
              ]
            : [];
        }),
      ),
    );
  }
  return sessions;
}

/** The preview of every rule on the same footing, to compare them before choosing. */
export function previewRules(
  input: PrescribeInput,
  count = RULE_PREVIEW_SESSIONS,
): Record<RuleId, RulePreviewSession[]> {
  return {
    double: previewRule({ ...input, rule: { id: "double" } }, count),
    linear: previewRule({ ...input, rule: { id: "linear" } }, count),
    top_backoff: previewRule({ ...input, rule: { id: "top_backoff" } }, count),
    maintain: previewRule({ ...input, rule: { id: "maintain" } }, count),
  };
}
