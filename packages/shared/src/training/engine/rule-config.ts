import { z } from "zod";

/** A rule's own settings take these values until the lifter changes them. */
export const LINEAR_RESET_PERCENT = 10;
export const BACKOFF_FALLBACK_PERCENT = 90;

/**
 * The progression rule of one exercise, stored as JSON on its exercise setting. No rule
 * (null) is the Double rule. A reader maps a rule it does not know to Double instead of failing,
 * so a newer build can add rules without breaking an older one.
 *
 * - `double`: reps climb to the top of the range, then load rises and reps start again.
 * - `linear`: fixed reps; load rises each Session every set was made. A miss holds the load once,
 *   the second miss in a row at that load lowers it by `reset_percent`.
 * - `top_backoff`: the top set progresses by double progression; back-offs are a share of it,
 *   `backoff_percent` or, when unset, the share the lifter used last time.
 * - `maintain`: loads and reps stay as last time; no stalled-lift note.
 */
export const ruleConfigSchema = z.discriminatedUnion("id", [
  z.strictObject({ id: z.literal("double") }),
  z.strictObject({
    id: z.literal("linear"),
    reset_percent: z.number().int().min(5).max(25).optional(),
  }),
  z.strictObject({
    id: z.literal("top_backoff"),
    backoff_percent: z.number().int().min(50).max(95).optional(),
  }),
  z.strictObject({ id: z.literal("maintain") }),
]);
export type RuleConfig = z.infer<typeof ruleConfigSchema>;
export type RuleId = RuleConfig["id"];
export const RULE_IDS = [
  "double",
  "linear",
  "top_backoff",
  "maintain",
] as const satisfies readonly RuleId[];

export const DEFAULT_RULE = { id: "double" } as const satisfies RuleConfig;

/**
 * The rule of an exercise setting as stored. A value this build cannot read (a rule from a newer
 * build) is the default, and so is Double itself: a Double exercise stores no rule.
 */
export function readRuleConfig(value: RuleConfig | null | undefined): RuleConfig | null {
  const parsed = ruleConfigSchema.safeParse(value);
  return parsed.success && parsed.data.id !== "double" ? parsed.data : null;
}
