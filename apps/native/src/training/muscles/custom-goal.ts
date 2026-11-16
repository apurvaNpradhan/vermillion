import { CUSTOM_GOAL_MAX, muscleGoalSchema, type MuscleGoal } from "@workspace/shared";

/** A Custom goal from the two typed fields; null while either is empty, not whole, or max < min. */
export function customGoal(min: string, max: string): MuscleGoal | null {
  if (!/^\d{1,2}$/.test(min) || !/^\d{1,2}$/.test(max)) return null;
  const parsed = muscleGoalSchema.safeParse({
    level: "custom",
    min: Number(min),
    max: Number(max),
  });
  return parsed.success && Number(max) <= CUSTOM_GOAL_MAX ? parsed.data : null;
}
