import { loadIdentity } from "../../vocabulary/format";
import type { SetKind } from "../../vocabulary/vocabulary";
import { effectiveWeight, estimatedOneRepMax } from "../../volume/volume";
import {
  addLoad,
  defaultStepKg,
  incrementFor,
  lightenLoad,
} from "../../progress/progression-steps";
import type { Progression, SetOutcome, SuggestedSet } from "../../progress/progression";
import type { ProgressionRule } from "../rule";
import { lowerAssistance } from "../assisted";
import { cappedRepCeiling, isBigJump } from "../ceiling";
import {
  OUTCOME_ORDER,
  REASON_OF,
  easySet,
  rangeMisses,
  wasGrind,
  type Outcome,
  type Slot,
} from "../slots";

const AT_CAP = 1e-4;

/**
 * Double progression, the default rule. Matched sets grow reps to the top of their range, then
 * add load and reset the reps. By default working sets wait for every working set to reach the
 * ceiling before adding load. Back-offs do the same within their own group. Top sets progress
 * independently. Logged effort tempers that (a grind holds once, an easy set adds double), a miss
 * of the range minimum in the same slot at the same load on two Sessions running resets the load.
 */
export const doubleRule: ProgressionRule<{ id: "double" }> = {
  id: "double",
  propose({
    planned,
    slots,
    saved,
    last,
    type,
    equipment,
    unit,
    loaded,
    settings,
    increments,
    context,
    grid,
    cap,
    roundedCap,
  }): Progression {
    const sets: (SuggestedSet | null)[] = planned.map(() => null);
    const outcomes: (SetOutcome | null)[] = planned.map(() => null);
    const misses = rangeMisses(slots, (index) => saved.get(index)?.exact);
    const missedSlots = new Set(
      misses.flatMap(({ index, set }) => (set.rpe != null ? [index] : [])),
    );
    const earlierMisses = new Map(
      rangeMisses(slots, (index) => saved.get(index)?.prior).map(({ index, set }) => [
        index,
        set.weight_kg == null ? null : loadIdentity(set.weight_kg),
      ]),
    );
    const held = new Set<number>();
    const resets = new Map<number, number>();
    const together = (kind: SetKind) =>
      !settings.progressionPerSet && (kind === "working" || kind === "backoff");
    const groupKey = (kind: SetKind, weight: number) => `${kind}/${weight}`;
    const groupResets = new Map<string, number>();
    for (const { index, set, minimum, reps } of misses) {
      const weight = set.weight_kg ?? null;
      if (earlierMisses.get(index) !== (weight === null ? null : loadIdentity(weight))) continue;
      held.add(index);
      if (!loaded || weight === null || weight <= 0) continue;
      const bodyweight = set.bodyweight_kg === undefined ? context.bodyweightKg : set.bodyweight_kg;
      const effective = effectiveWeight(type, weight, bodyweight);
      const max = effective === null ? null : estimatedOneRepMax(effective, reps, set.rpe);
      const bodyweightOffset = type === "bodyweight_weighted_reps" ? (bodyweight ?? 0) : 0;
      // Invert Brzycki within its 1–12 rep range. Outside it, cut the logged load by 10%.
      const target =
        max === null || minimum > 12
          ? weight * 0.9
          : (max * (37 - minimum)) / 36 - bodyweightOffset;
      const rounded = lightenLoad(
        weight,
        Math.max(0, target) / weight,
        equipment,
        unit,
        grid,
        "down",
      );
      // A weighted bodyweight lift can still be done when no positive added load fits the target.
      const reset =
        type === "bodyweight_weighted_reps" && loadIdentity(rounded) > loadIdentity(target)
          ? 0
          : rounded;
      if (loadIdentity(reset) >= loadIdentity(weight)) continue;
      resets.set(index, reset);
      if (together(set.kind)) {
        const key = groupKey(set.kind, weight);
        groupResets.set(key, Math.min(reset, groupResets.get(key) ?? reset));
      }
    }
    // Without a weight to add, a rep range grows past its top only when every set topped it.
    const allTopped = slots.every(({ target, index }) => {
      if (target.kind === "working" && !saved.get(index)?.exact) return true;
      const before = saved.get(index)?.before;
      return (
        target.reps_min !== undefined &&
        before?.reps != null &&
        before.reps >= (target.reps_max ?? target.reps_min)
      );
    });
    const grindHolds = new Set<number>();
    const repeatedGrindGroups = new Set<SetKind>();
    for (const { index, target } of slots) {
      const before = saved.get(index)?.before;
      const ceiling = target.reps_max ?? target.reps_min;
      if (!before || ceiling === undefined || (before.reps ?? 0) < ceiling) continue;
      const prior = saved.get(index)?.prior;
      const repeat =
        prior &&
        prior.reps === before.reps &&
        (prior.weight_kg == null ? null : loadIdentity(prior.weight_kg)) ===
          (before.weight_kg == null ? null : loadIdentity(before.weight_kg)) &&
        wasGrind(prior, target);
      if (repeat && together(target.kind)) repeatedGrindGroups.add(target.kind);
      if (!repeat && wasGrind(before, target)) grindHolds.add(index);
    }
    const waitsForEffort = ({ index, target }: Slot) =>
      grindHolds.has(index) && !repeatedGrindGroups.has(target.kind);
    const waiting = new Set<SetKind>();
    const easyLoads = new Map<string, boolean>();
    for (const kind of ["working", "backoff"] as const) {
      for (const slot of slots) {
        const { target, index } = slot;
        if (target.kind !== kind) continue;
        const before = saved.get(index)?.exact;
        if (!before) continue;
        const ceiling = target.reps_max ?? target.reps_min;
        if (
          ceiling === undefined ||
          before.reps == null ||
          before.reps < ceiling ||
          before.weight_kg == null ||
          waitsForEffort(slot)
        )
          waiting.add(kind);
        if (before.weight_kg == null) continue;
        const key = groupKey(kind, before.weight_kg);
        easyLoads.set(key, (easyLoads.get(key) ?? true) && easySet(before, target));
      }
    }
    /** Straight sets move together: while one is short of the extended ceiling, the load waits. */
    const behindExtended = (kind: SetKind) =>
      together(kind) &&
      slots.some(({ target, index }) => {
        const reps = saved.get(index)?.exact?.reps;
        const top = target.reps_max ?? target.reps_min;
        return (
          target.kind === kind && reps != null && top !== undefined && reps < cappedRepCeiling(top)
        );
      });
    const ordered: Outcome[] = [];
    let incrementKg: number | null = null;
    let lastMatchedWorkingIndex: number | undefined;
    for (const slot of slots) {
      const { index, target } = slot;
      if (
        target.kind === "working" &&
        !saved.get(index)?.exact &&
        !settings.progressionPerSet &&
        lastMatchedWorkingIndex !== undefined
      ) {
        sets[index] = sets[lastMatchedWorkingIndex] ?? null;
        outcomes[index] = outcomes[lastMatchedWorkingIndex] ?? null;
        continue;
      }
      const before = saved.get(index)?.before;
      if (!before) continue;
      if (target.kind === "working") lastMatchedWorkingIndex = index;
      const assisted = type === "bodyweight_assisted_reps";
      const same: SuggestedSet = { weightKg: before.weight_kg ?? null, reps: before.reps ?? null };
      const reset =
        together(target.kind) && same.weightKg !== null
          ? groupResets.get(groupKey(target.kind, same.weightKg))
          : resets.get(index);
      let outcome: Outcome = "same";
      let next = same;
      let jump: { factor: number; ceiling: number } | undefined;
      if (
        cap !== null &&
        before.weight_kg != null &&
        (grid?.source === "cap"
          ? before.weight_kg > cap
          : loadIdentity(before.weight_kg) > loadIdentity(cap))
      ) {
        // Last time's load is more than this gym has: the cap is the most the lifter can load.
        outcome = "capped";
        next = { ...same, weightKg: cap };
      } else if (reset !== undefined && target.reps_min !== undefined) {
        outcome = "reset";
        next = { weightKg: reset, reps: target.reps_min };
      } else if (held.has(index) || missedSlots.has(index)) outcome = "hold_missed";
      else if (waitsForEffort(slot)) outcome = "hold_effort";
      else if (target.reps_min !== undefined && before.reps != null) {
        const max = target.reps_max ?? target.reps_min;
        const canLoad = (loaded || assisted) && before.weight_kg != null;
        const atCap =
          roundedCap !== null &&
          before.weight_kg != null &&
          before.weight_kg >= roundedCap - AT_CAP;
        const extended = cappedRepCeiling(max);
        if (before.reps >= max && atCap) {
          // The load cannot rise: reps keep growing to the extended ceiling, then a hint. Straight
          // working sets still move together: nothing grows until every set reached the ceiling.
          if (together(target.kind) && waiting.has(target.kind)) outcome = "hold_together";
          else if (before.reps >= extended) outcome = "cap_hint";
          else {
            outcome = "cap_reps";
            next = { ...same, reps: before.reps + 1 };
          }
        } else if (before.reps >= max) {
          if (canLoad && (!together(target.kind) || !waiting.has(target.kind))) {
            const easy = together(target.kind)
              ? (easyLoads.get(groupKey(target.kind, before.weight_kg ?? 0)) ?? false)
              : easySet(before, target);
            const base = before.weight_kg ?? 0;
            if (assisted) {
              // Less help, one step down the grid; with none left the reps keep climbing.
              const lowered = lowerAssistance(
                base,
                unit,
                grid,
                defaultStepKg(equipment, unit, base),
              );
              if (lowered === null) {
                outcome = "add_rep";
                next = { ...same, reps: before.reps + 1 };
              } else {
                incrementKg ??= base - lowered;
                outcome = "less_assist";
                next = { weightKg: lowered, reps: target.reps_min };
              }
              ordered.push(outcome);
              outcomes[index] = {
                reason: REASON_OF[outcome],
                changeKg: outcome === "less_assist" ? base - (next.weightKg ?? 0) : undefined,
              };
              sets[index] = next;
              continue;
            }
            const added = incrementFor(base, equipment, increments, grid) * (easy ? 2 : 1);
            const minimumIncrease =
              grid?.source === "kit" && settings.weightIncrementKg === null
                ? defaultStepKg("barbell", unit, base)
                : 0;
            const raised = addLoad(base, added, unit, grid, minimumIncrease);
            if (raised === null) {
              outcome = before.reps >= extended ? "cap_hint" : "cap_reps";
              if (outcome === "cap_reps") next = { ...same, reps: before.reps + 1 };
            } else if (!easy && isBigJump(base, raised) && before.reps < extended) {
              // The next load is far heavier (a dumbbell, a stack): earn more reps before it.
              outcome = "more_reps";
              next = { ...same, reps: before.reps + 1 };
              jump = { factor: raised / base, ceiling: extended };
            } else if (!easy && isBigJump(base, raised) && behindExtended(target.kind)) {
              outcome = "hold_together";
            } else {
              incrementKg ??= raised - base;
              outcome = "add_weight";
              next = { weightKg: raised, reps: target.reps_min };
            }
          } else if (!canLoad) {
            outcome = allTopped ? "add_rep" : "hold_together";
            next = { ...same, reps: allTopped ? before.reps + 1 : before.reps };
          } else {
            outcome = "hold_together";
          }
        } else {
          outcome = "add_rep";
          next = { ...same, reps: Math.min(max, before.reps + 1) };
        }
      }
      ordered.push(outcome);
      outcomes[index] = {
        reason: REASON_OF[outcome],
        limit:
          outcome === "capped" || outcome === "cap_hint" || outcome === "cap_reps"
            ? grid?.plateLimit
              ? "plates"
              : "equipment"
            : undefined,
        changeKg:
          outcome === "add_weight" ? (next.weightKg ?? 0) - (before.weight_kg ?? 0) : undefined,
        capKg: outcome === "capped" ? (next.weightKg ?? undefined) : undefined,
        loadFactor: jump?.factor,
        ceiling: jump?.ceiling,
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
