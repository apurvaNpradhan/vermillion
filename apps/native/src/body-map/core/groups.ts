import { MUSCLE_GROUPS, type MuscleGroup } from "@workspace/shared";

/** Muscle groups that have no drawing: they are listed and filtered, never highlighted. */
export const UNDRAWN = ["cardio", "full_body", "other"] as const satisfies readonly MuscleGroup[];
export type UndrawnGroup = (typeof UNDRAWN)[number];

/** The 17 muscle groups the body drawing can highlight. */
export type BodyGroup = Exclude<MuscleGroup, UndrawnGroup>;
export const BODY_GROUPS: readonly BodyGroup[] = MUSCLE_GROUPS.filter(isBodyGroup);

export type BodyView = "front" | "back";
export const BODY_VIEWS = ["front", "back"] as const satisfies readonly BodyView[];

/** Whether the group can be drawn (a type predicate so callers can narrow). */
export function isBodyGroup(group: MuscleGroup): group is BodyGroup {
  return !UNDRAWN.some((undrawn) => undrawn === group);
}
