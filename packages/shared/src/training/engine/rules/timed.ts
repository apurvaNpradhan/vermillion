import type { ExerciseType } from "../../../exercise/vocabulary";
import type { LoggedSet } from "../../logging/logged-set";
import type { PlannedSet } from "../../plans/planned-sets";
import { loadIdentity } from "../../vocabulary/format";
import type { SetKind } from "../../vocabulary/vocabulary";
import { addLoad, defaultStepKg, incrementFor } from "../../progress/progression-steps";
import type { Progression, SetOutcome, SuggestedSet } from "../../progress/progression";
import type { ProgressionRule } from "../rule";
import { OUTCOME_ORDER, REASON_OF, type Outcome, type Slot } from "../slots";

/** A plank or hold that was made asks for this many seconds more. */
export const TIME_STEP_S = 5;
/** A carry with no load that was made asks for this many metres more. */
export const DISTANCE_STEP_M = 5;

/** Planks and holds (a duration) and carries (a load and a distance) progress by time or distance. */
export const isTimed = (type: ExerciseType) =>
  type === "duration" || type === "short_distance_weight";

/** The most a set can be made at its own target: the longer it was held or the further it was carried. */
function made(set: LoggedSet | undefined, target: PlannedSet, carry: boolean): boolean {
  if (!set) return false;
  const [done, aimed] = carry
    ? [set.distance_m, (set.target ?? target).distance_m]
    : [set.duration_s, (set.target ?? target).duration_s];
  return done != null && done >= (aimed ?? 0);
}

/**
 * Timed and carried work. A set that was made at its own target asks for more: five seconds on a
 * hold, a step of load on a carry (or five metres, when it carries nothing). A set that fell short
 * asks for the target again. Straight working sets are judged together, like Double; the rule is
 * the same whichever rule the exercise names, except Maintain.
 */
export const timedRule: ProgressionRule<{ id: "double" }> = {
  id: "double",
  propose({
    planned,
    slots,
    saved,
    last,
    type,
    equipment,
    unit,
    settings,
    increments,
    grid,
  }): Progression {
    const carry = type === "short_distance_weight";
    const together = (kind: SetKind) =>
      !settings.progressionPerSet && (kind === "working" || kind === "backoff");
    const membersOf = (slot: Slot) =>
      together(slot.target.kind)
        ? slots.filter(({ target }) => target.kind === slot.target.kind)
        : [slot];
    const allMade = (slot: Slot) => {
      const counted = membersOf(slot).flatMap((member) => {
        const exact = saved.get(member.index)?.exact;
        return exact ? [{ member, exact }] : [];
      });
      return counted.length === 0
        ? null
        : counted.every(({ member, exact }) => made(exact, member.target, carry));
    };

    const sets: (SuggestedSet | null)[] = planned.map(() => null);
    const outcomes: (SetOutcome | null)[] = planned.map(() => null);
    const ordered: Outcome[] = [];
    let incrementKg: number | null = null;
    const lead = new Map<SetKind, number>();
    for (const slot of slots) {
      const { index, target } = slot;
      const before = saved.get(index)?.before;
      if (!before) continue;
      if (!saved.get(index)?.exact && together(target.kind)) {
        // A slot added since has no counterpart: it follows the sets that do.
        const first = lead.get(target.kind);
        if (first !== undefined) {
          sets[index] = sets[first] ?? null;
          outcomes[index] = outcomes[first] ?? null;
          continue;
        }
      } else lead.set(target.kind, index);
      const verdict = allMade(slot);
      const weight = before.weight_kg ?? null;
      const duration = before.duration_s ?? null;
      const distance = before.distance_m ?? null;
      const same: SuggestedSet = carry
        ? { weightKg: weight, reps: null, distanceM: distance }
        : { weightKg: null, reps: null, durationS: duration };
      let outcome: Outcome = "same";
      let next = same;
      let change: Pick<SetOutcome, "changeKg" | "changeS" | "changeM"> = {};
      if (verdict === true) {
        if (!carry && duration !== null) {
          outcome = "add_time";
          next = { ...same, durationS: duration + TIME_STEP_S };
          change = { changeS: TIME_STEP_S };
        } else if (carry && weight !== null && weight > 0) {
          const added = incrementFor(weight, equipment, increments, grid);
          const minimumIncrease =
            grid?.source === "kit" && settings.weightIncrementKg === null
              ? defaultStepKg("barbell", unit, weight)
              : 0;
          const raised = addLoad(weight, added, unit, grid, minimumIncrease);
          if (raised === null) outcome = "cap_hint";
          else {
            incrementKg ??= raised - weight;
            outcome = "add_weight";
            next = { ...same, weightKg: raised };
            change = { changeKg: raised - weight };
          }
        } else if (carry && distance !== null) {
          outcome = "add_distance";
          next = { ...same, distanceM: distance + DISTANCE_STEP_M };
          change = { changeM: DISTANCE_STEP_M };
        }
      } else if (verdict === false) {
        const aimed = carry ? target.distance_m : target.duration_s;
        const done = carry ? distance : duration;
        if (aimed !== undefined && (done === null || loadIdentity(aimed) !== loadIdentity(done))) {
          outcome = "hold_target";
          next = carry ? { ...same, distanceM: aimed } : { ...same, durationS: aimed };
        }
      }
      ordered.push(outcome);
      outcomes[index] = {
        reason: REASON_OF[outcome],
        ...change,
        limit: outcome === "cap_hint" ? (grid?.plateLimit ? "plates" : "equipment") : undefined,
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
