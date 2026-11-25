import type { ProgressionRule } from "../rule";
import type { RuleConfig } from "../rule-config";
import { doubleRule } from "./double";

/** The rule that proposes loads for an exercise: its own, or Double when it has none. */
export function ruleFor(config: RuleConfig | null | undefined): ProgressionRule {
  switch (config?.id) {
    case "double":
    case undefined:
      return doubleRule;
  }
}
