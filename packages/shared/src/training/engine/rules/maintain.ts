import { loadIdentity } from "../../vocabulary/format";
import { incrementFor } from "../../progress/progression-steps";
import type { Progression, SetOutcome, SuggestedSet } from "../../progress/progression";
import type { ProgressionRule } from "../rule";
import type { RuleConfig } from "../rule-config";
import { REASON_OF, type Outcome } from "../slots";

type MaintainConfig = Extract<RuleConfig, { id: "maintain" }>;

/**
 * Maintain: loads and reps stay as last time, set by set, so the lift is not pushed. Nothing is
 * added, and the stalled-lift note is never shown for it. A load above the gym's cap still comes
 * down to the cap, and breaks and Deloads still lower it before this rule runs.
 */
export const maintainRule: ProgressionRule<MaintainConfig> = {
  id: "maintain",
  propose({ planned, slots, saved, last, equipment, increments, grid, cap }): Progression {
    const sets: (SuggestedSet | null)[] = planned.map(() => null);
    const outcomes: (SetOutcome | null)[] = planned.map(() => null);
    let capped = false;
    for (const { index } of slots) {
      const before = saved.get(index)?.before;
      if (!before) continue;
      const weight = before.weight_kg ?? null;
      const over =
        cap !== null &&
        weight !== null &&
        (grid?.source === "cap" ? weight > cap : loadIdentity(weight) > loadIdentity(cap));
      const outcome: Outcome = over ? "capped" : "same";
      capped ||= over;
      sets[index] = { weightKg: over ? cap : weight, reps: before.reps ?? null };
      outcomes[index] = {
        reason: REASON_OF[outcome],
        limit: over ? (grid?.plateLimit ? "plates" : "equipment") : undefined,
        capKg: over ? (cap ?? undefined) : undefined,
      };
    }
    return {
      reason: capped ? "capped" : "same_as_last",
      sets,
      outcomes,
      incrementKg: incrementFor(last?.sets[0]?.weight_kg ?? null, equipment, increments, grid),
      breakDays: null,
    };
  },
};
