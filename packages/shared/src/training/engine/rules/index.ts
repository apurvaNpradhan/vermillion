import type { ExerciseType } from "../../../exercise/vocabulary";
import type { ProgressionRule } from "../rule";
import type { RuleConfig } from "../rule-config";
import { doubleRule } from "./double";
import { linearRule } from "./linear";
import { maintainRule } from "./maintain";
import { isTimed, timedRule } from "./timed";
import { topBackoffRule } from "./top-backoff";

/**
 * The rule that proposes loads for an exercise: its own, or Double when it has none. Maintain
 * holds any type; planks and carries have their own way of progressing whatever else is chosen.
 */
export function ruleFor(
  config: RuleConfig | null | undefined,
  type?: ExerciseType,
): ProgressionRule {
  if (config?.id !== "maintain" && type !== undefined && isTimed(type)) return timedRule;
  switch (config?.id) {
    case "linear":
      return linearRule;
    case "top_backoff":
      return topBackoffRule;
    case "maintain":
      return maintainRule;
    case "double":
    case undefined:
      return doubleRule;
  }
}
