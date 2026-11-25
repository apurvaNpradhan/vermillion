import type { LoggedSet } from "../../logging/logged-set";
import type { PlannedSet } from "../../plans/planned-sets";
import { loadIdentity } from "../../vocabulary/format";
import type { SetKind } from "../../vocabulary/vocabulary";
import {
  addLoad,
  defaultStepKg,
  incrementFor,
  lightenLoad,
} from "../../progress/progression-steps";
import type { Progression, SetOutcome, SuggestedSet } from "../../progress/progression";
import type { ProgressionRule, RuleInput } from "../rule";
import { DEFAULT_RULE, LINEAR_RESET_PERCENT, type RuleConfig } from "../rule-config";
import { OUTCOME_ORDER, REASON_OF, type Outcome, type Slot } from "../slots";
import { doubleRule } from "./double";

type LinearConfig = Extract<RuleConfig, { id: "linear" }>;

const reached = (set: LoggedSet | undefined, target: PlannedSet) =>
  set?.reps != null && target.reps_min !== undefined && set.reps >= target.reps_min;

const sameLoad = (a: LoggedSet, b: LoggedSet) =>
  (a.weight_kg == null ? null : loadIdentity(a.weight_kg)) ===
  (b.weight_kg == null ? null : loadIdentity(b.weight_kg));

/**
 * Linear progression: fixed reps (the minimum of the planned range), load added each Session every
 * set was made. A Session that missed holds the load; the second miss in a row at that load lowers
 * it by the rule's reset share, rounded down onto the grid, and the lifter builds again from there.
 * Straight working and back-off sets are judged together, like Double; effort is not read.
 */
export const linearRule: ProgressionRule<LinearConfig> = {
  id: "linear",
  propose(input: RuleInput<LinearConfig>): Progression {
    // Reps-only lifts have no load to add: Double's reps rule is the closest thing.
    if (!input.loaded) return doubleRule.propose({ ...input, config: DEFAULT_RULE });
    const { config, planned, slots, saved, last, equipment, unit, settings, increments, grid } =
      input;
    const { cap } = input;
    const keep = 1 - (config.reset_percent ?? LINEAR_RESET_PERCENT) / 100;
    const together = (kind: SetKind) =>
      !settings.progressionPerSet && (kind === "working" || kind === "backoff");
    const membersOf = (slot: Slot) =>
      together(slot.target.kind)
        ? slots.filter(({ target }) => target.kind === slot.target.kind)
        : [slot];
    /** Whether the Session before met every set of the slot's group, and whether it missed at the same load. */
    const verdictOf = (slot: Slot) => {
      const counted = membersOf(slot).flatMap((member) => {
        const exact = saved.get(member.index)?.exact;
        return exact ? [{ member, exact, prior: saved.get(member.index)?.prior }] : [];
      });
      if (counted.length === 0) return null;
      const met = counted.every(({ member, exact }) => reached(exact, member.target));
      const repeated =
        !met &&
        counted.some(
          ({ member, exact, prior }) =>
            prior !== undefined &&
            member.target.reps_min !== undefined &&
            prior.reps != null &&
            prior.reps < member.target.reps_min &&
            sameLoad(prior, exact),
        );
      return { met, repeated };
    };

    const sets: (SuggestedSet | null)[] = planned.map(() => null);
    const outcomes: (SetOutcome | null)[] = planned.map(() => null);
    const ordered: Outcome[] = [];
    let incrementKg: number | null = null;
    const matched = new Map<SetKind, number>();
    for (const slot of slots) {
      const { index, target } = slot;
      const before = saved.get(index)?.before;
      if (!before) continue;
      const verdict = verdictOf(slot);
      if (!saved.get(index)?.exact && together(target.kind)) {
        // A slot added since has no counterpart: it follows the sets that do.
        const lead = matched.get(target.kind);
        if (lead !== undefined) {
          sets[index] = sets[lead] ?? null;
          outcomes[index] = outcomes[lead] ?? null;
          continue;
        }
      } else matched.set(target.kind, index);
      const reps = target.reps_min ?? before.reps ?? null;
      const base = before.weight_kg ?? null;
      let outcome: Outcome = "same";
      let next: SuggestedSet = { weightKg: base, reps: before.reps ?? null };
      if (
        cap !== null &&
        base !== null &&
        (grid?.source === "cap" ? base > cap : loadIdentity(base) > loadIdentity(cap))
      ) {
        outcome = "capped";
        next = { weightKg: cap, reps: before.reps ?? null };
      } else if (verdict && base !== null && reps !== null) {
        if (verdict.met) {
          const added = incrementFor(base, equipment, increments, grid);
          const minimumIncrease =
            grid?.source === "kit" && settings.weightIncrementKg === null
              ? defaultStepKg("barbell", unit, base)
              : 0;
          const raised = addLoad(base, added, unit, grid, minimumIncrease);
          if (raised === null) {
            outcome = "cap_hint";
            next = { weightKg: base, reps };
          } else {
            incrementKg ??= raised - base;
            outcome = "add_weight";
            next = { weightKg: raised, reps };
          }
        } else {
          const lowered = verdict.repeated
            ? lightenLoad(base, keep, equipment, unit, grid, "down")
            : base;
          if (loadIdentity(lowered) < loadIdentity(base)) {
            outcome = "reset";
            next = { weightKg: lowered, reps };
          } else {
            outcome = "hold_missed";
            next = { weightKg: base, reps };
          }
        }
      }
      ordered.push(outcome);
      outcomes[index] = {
        reason: REASON_OF[outcome],
        limit:
          outcome === "capped" || outcome === "cap_hint"
            ? grid?.plateLimit
              ? "plates"
              : "equipment"
            : undefined,
        changeKg: outcome === "add_weight" ? (next.weightKg ?? 0) - (base ?? 0) : undefined,
        capKg: outcome === "capped" ? (next.weightKg ?? undefined) : undefined,
      };
      sets[index] = next;
    }
    const top = OUTCOME_ORDER.find((outcome) => ordered.includes(outcome)) ?? "same";
    return {
      reason: REASON_OF[top],
      sets,
      outcomes,
      incrementKg:
        incrementKg ?? incrementFor(last?.sets[0]?.weight_kg ?? null, equipment, increments, grid),
      breakDays: null,
    };
  },
};
