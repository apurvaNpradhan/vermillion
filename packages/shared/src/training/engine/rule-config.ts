import { z } from "zod";

/**
 * The progression rule of one exercise, stored as JSON text on its exercise setting. No rule
 * (null) is the Double rule. A reader maps a rule it does not know to Double instead of failing,
 * so a newer build can add rules without breaking an older one.
 */
export const ruleConfigSchema = z.discriminatedUnion("id", [
  z.strictObject({ id: z.literal("double") }),
]);
export type RuleConfig = z.infer<typeof ruleConfigSchema>;
export type RuleId = RuleConfig["id"];

export const DEFAULT_RULE = { id: "double" } as const satisfies RuleConfig;
