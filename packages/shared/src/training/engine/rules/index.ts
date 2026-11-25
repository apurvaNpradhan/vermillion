import type { ProgressionRule } from "../rule";
import type { RuleConfig } from "../rule-config";
import { doubleRule } from "./double";
import { linearRule } from "./linear";
import { maintainRule } from "./maintain";
import { topBackoffRule } from "./top-backoff";

/** The rule that proposes loads for an exercise: its own, or Double when it has none. */
export function ruleFor(config: RuleConfig | null | undefined): ProgressionRule {
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
