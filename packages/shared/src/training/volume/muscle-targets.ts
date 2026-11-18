import { z } from "zod";

import type { MuscleGroup } from "../../exercise/vocabulary";

/**
 * The muscle groups that carry a weekly set target: the large and the commonly trained ones.
 * Forearms, neck, lower back, abductors and adductors work as secondary muscles in most lifts, so
 * a target for them would only ever be hit by accident; they still count in the Muscle volume
 * numbers and show on the body map. Cardio, full body and other have no muscle to target.
 */
export const TARGET_MUSCLES = [
  "chest",
  "upper_back",
  "lats",
  "shoulders",
  "biceps",
  "triceps",
  "traps",
  "abdominals",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
] as const satisfies readonly MuscleGroup[];
export type TargetMuscle = (typeof TARGET_MUSCLES)[number];

export const isTargetMuscle = (muscle: MuscleGroup): muscle is TargetMuscle =>
  TARGET_MUSCLES.some((target) => target === muscle);

export const GOAL_LEVELS = ["maintain", "grow", "focus", "custom"] as const;
export type GoalLevel = (typeof GOAL_LEVELS)[number];

/** A weekly range of Counted sets, both ends inclusive. */
export type SetRange = { min: number; max: number };

/** The ranges of the preset levels, in sets a week. */
export const GOAL_RANGES = {
  maintain: { min: 6, max: 10 },
  grow: { min: 10, max: 20 },
  focus: { min: 16, max: 24 },
} as const satisfies Record<Exclude<GoalLevel, "custom">, SetRange>;

/** The most sets a week a Custom goal may ask for. */
export const CUSTOM_GOAL_MAX = 60;

export const muscleGoalSchema = z.discriminatedUnion("level", [
  z.object({ level: z.enum(["maintain", "grow", "focus"]) }),
  z
    .object({
      level: z.literal("custom"),
      min: z.number().int().min(0).max(CUSTOM_GOAL_MAX),
      max: z.number().int().min(1).max(CUSTOM_GOAL_MAX),
    })
    .refine((goal) => goal.max >= goal.min, "max is below min"),
]);
export type MuscleGoal = z.infer<typeof muscleGoalSchema>;

/** The saved goals: only explicit overrides of the program target are stored. */
export const muscleGoalsSchema = z.partialRecord(z.enum(TARGET_MUSCLES), muscleGoalSchema);
export type MuscleGoals = z.infer<typeof muscleGoalsSchema>;

/**
 * The saved goal, else the active program's planned weekly count as the default; with neither
 * there is no target. A saved goal never depends on a program being active.
 */
export function goalRange(
  goal: MuscleGoal | undefined,
  planned: number | null = null,
): SetRange | null {
  if (goal !== undefined)
    return goal.level === "custom" ? { min: goal.min, max: goal.max } : GOAL_RANGES[goal.level];
  if (planned === null) return null;
  return planned > 0 ? { min: planned, max: planned } : null;
}

/** Where a muscle's sets stand against its range. */
export type MuscleStatus = "below" | "on_target" | "above";

export function muscleStatus(sets: number, range: SetRange): MuscleStatus {
  return sets < range.min ? "below" : sets > range.max ? "above" : "on_target";
}
