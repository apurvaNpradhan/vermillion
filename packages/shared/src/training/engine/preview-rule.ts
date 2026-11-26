import { SET_FIELDS } from "../../exercise/vocabulary";
import type { LoggedSet } from "../logging/logged-set";
import { progresses, type ProgressionReason, type SetOutcome } from "../progress/progression";
import type { PlannedSet } from "../plans/planned-sets";
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
  /** The progressing sets, in order; timed and carried work also has its time and distance. */
  sets: {
    kind: SetKind;
    weightKg: number | null;
    reps: number | null;
    durationS?: number;
    distanceM?: number;
  }[];
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
    // Every value the exercise type records must be planned: reps, a time, a distance or a load.
    const fields: readonly string[] = SET_FIELDS[input.place.type];
    const missing = (target: PlannedSet) =>
      (fields.includes("reps") && target.reps_min === undefined) ||
      (fields.includes("weight") && target.weight_kg === undefined) ||
      (fields.includes("duration") && target.duration_s === undefined) ||
      (fields.includes("distance") && target.distance_m === undefined);
    if (planned.length === 0 || planned.some(missing)) return [];
    history.unshift(
      session(
        "rule-preview-start",
        new Date(now.getTime() - WEEK_MS),
        planned.map((target) => ({
          ...entry,
          kind: target.kind,
          weight_kg: target.weight_kg ?? null,
          reps: target.reps_min ?? null,
          ...(target.duration_s === undefined ? {} : { duration_s: target.duration_s }),
          ...(target.distance_m === undefined ? {} : { distance_m: target.distance_m }),
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
        ? [
            {
              kind: target.kind,
              weightKg: next.weightKg,
              reps: next.reps,
              ...(next.durationS == null ? {} : { durationS: next.durationS }),
              ...(next.distanceM == null ? {} : { distanceM: next.distanceM }),
            },
          ]
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
          const share = progression.outcomes[position]?.share;
          return progresses(target.kind) && next
            ? [
                {
                  ...entry,
                  kind: target.kind,
                  weight_kg: next.weightKg,
                  reps: next.reps,
                  // What the Session's snapshot would hold: a back-off made as asked hands on the
                  // share it was meant to be, so the preview never re-derives it from rounded loads.
                  suggested: {
                    weight_kg: next.weightKg,
                    reps: next.reps,
                    ...(share === undefined ? {} : { share }),
                  },
                  ...(next.durationS == null ? {} : { duration_s: next.durationS }),
                  ...(next.distanceM == null ? {} : { distance_m: next.distanceM }),
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
