import type { Equipment, ExerciseType } from "../../exercise/vocabulary";
import type { PlannedSet } from "../plans/planned-sets";
import { isBaselinePhase } from "../phases/phases";
import type { SetKind } from "../vocabulary/vocabulary";
import {
  LIGHTER_WEEK_LOAD,
  activeLighterWeek,
  outsideLighterWeeks,
} from "../progress/lighter-week";
import { usesFixedPrescription } from "../progress/suggestion-history";
import { gridCapInUnit, incrementFor, lightenLoad } from "../progress/progression-steps";
import {
  progresses,
  trainingBreak,
  type IncrementSettings,
  type Progression,
  type ProgressionContext,
  type ProgressionReason,
  type ProgressionSession,
  type SetOutcome,
  type SuggestedSet,
} from "../progress/progression";
import type { RuleConfig } from "./rule-config";
import { ruleFor } from "./rules";
import { slotsOf } from "./slots";
import { SESSION_LIMITS } from "../vocabulary/vocabulary";
import type { Evidence } from "../progress/evidence";

const AT_CAP = 1e-4;
/** A load that landed this far (as a share of the last load) from the intended cut is named. */
const SNAP_POINTS = 0.015;
/** Kinds that scale with a break or Deload without progressing: drop, failure and myo sets. */
const SCALED_KINDS: readonly SetKind[] = ["drop", "failure", "myo"];
const done = <Set extends { completed_at: string | null }>(sets: readonly Set[]) =>
  sets.filter((set) => set.completed_at !== null);

/**
 * The next sets of an exercise (ADR 0038), by stages: eligibility, the Test single, the baseline
 * Session, a reset for a break, Lighter week, stall deload or Deload phase, then the exercise's
 * rule (Double unless it names another) decides how load and reps move. `history` is newest first,
 * all of it; the baselines come from `context.baselineHistory` when given. Warm-ups,
 * Lighter-week Sessions and Test or Deload phase Sessions are never a baseline.
 */
export function suggestNext(
  planned: readonly PlannedSet[],
  history: readonly ProgressionSession[],
  type: ExerciseType,
  equipment: Equipment,
  settings: IncrementSettings,
  context: ProgressionContext,
  config: RuleConfig = { id: "double" },
): Progression | null {
  const loaded = type === "weight_reps" || type === "bodyweight_weighted_reps";
  if (!loaded && type !== "reps_only" && type !== "bodyweight_reps") return null;
  const slots = slotsOf(planned);
  if (slots.length === 0) return null;
  const unit = settings.weightUnit;
  const increments = { ...settings, exerciseType: type };
  const grid = context.grid ?? null;
  const cap = loaded ? (grid?.capKg ?? null) : null;
  const roundedCap = gridCapInUnit(grid, unit);
  if (context.testSingle) {
    return {
      reason: "test_single",
      sets: planned.map((set) =>
        set.kind === "top" ? { weightKg: set.weight_kg ?? null, reps: 1 } : null,
      ),
      outcomes: planned.map((set) => (set.kind === "top" ? { reason: "test_single" } : null)),
      incrementKg: 0,
      breakDays: null,
    };
  }
  const baselinesIn = (sessions: readonly ProgressionSession[]) =>
    outsideLighterWeeks(sessions, context.lighterWeeks ?? []).flatMap((session) => {
      if (!isBaselinePhase(session.phase)) return [];
      const logged = done(session.sets);
      const sets = logged.filter((set) => progresses(set.kind));
      return sets.length > 0 ? [{ sets, logged, id: session.id, at: session.started_at }] : [];
    });
  const baselines = baselinesIn(context.baselineHistory ?? history);
  const [last] = baselines;
  const fixedBaselines = context.fixedBaselineHistory?.length
    ? baselinesIn(context.fixedBaselineHistory)
    : context.fixedFallbackHistory
      ? baselinesIn(context.fixedFallbackHistory)
      : baselines;
  const saved = new Map(
    slots.map(({ target, ordinal, index }) => {
      const [latest, older] = usesFixedPrescription(planned, target) ? fixedBaselines : baselines;
      const matching = latest?.sets.filter(({ kind }) => kind === target.kind) ?? [];
      const exact = matching[ordinal];
      return [
        index,
        {
          exact,
          before: exact ?? matching.at(-1),
          prior: older?.sets.filter(({ kind }) => kind === target.kind)[ordinal],
        },
      ] as const;
    }),
  );
  if (!last && ![...saved.values()].some(({ before }) => before)) return null;
  // The break clock runs from the latest Session with a completed working set, across all Workouts and gyms. A
  // Session of only warm-ups or unticked sets is not training.
  const { days: breakDays, load: breakLoad } = trainingBreak(history, context.now);
  const lighter =
    context.deload === true || activeLighterWeek(context.lighterWeeks ?? [], context.now) !== null;
  // A phase may ask for less than a Lighter week does (or for it alone): the lighter of them.
  const phaseFactor =
    context.phaseLoad !== undefined && context.phaseLoad < 1 ? context.phaseLoad : 1;
  const lightFactor = Math.min(lighter ? LIGHTER_WEEK_LOAD : 1, phaseFactor);
  // The stricter of a break and a Lighter week wins; a Lighter week names itself on a tie.
  const breakFactor = loaded || type === "bodyweight_reps" ? breakLoad : 1;
  const factor = Math.min(lightFactor, breakFactor);
  const resetReason: ProgressionReason | null =
    factor === 1 ? null : breakFactor < lightFactor ? "after_break" : "deload";

  // The phase names the reset (and so rounds down) when its factor is the one in force.
  const phaseDecides =
    resetReason === "deload" && phaseFactor < 1 && Math.abs(factor - phaseFactor) < AT_CAP;
  // The Session the first progressing set was read from, with the sets it was compared against.
  const [firstSlot] = slots;
  const lead = (
    firstSlot && usesFixedPrescription(planned, firstSlot.target) ? fixedBaselines : baselines
  )[0];
  const baseline: Evidence["baseline"] = lead
    ? {
        ...(lead.id === undefined ? {} : { id: lead.id }),
        at: lead.at,
        sets: lead.sets.slice(0, SESSION_LIMITS.setsPerExercise).map((set) => ({
          kind: set.kind,
          weightKg: set.weight_kg ?? null,
          reps: set.reps ?? null,
        })),
      }
    : null;
  const sets: (SuggestedSet | null)[] = planned.map(() => null);
  const outcomes: (SetOutcome | null)[] = planned.map(() => null);
  if (resetReason !== null) {
    const ordinals = new Map<SetKind, number>();
    for (const [index, target] of planned.entries()) {
      const ordinal = ordinals.get(target.kind) ?? 0;
      ordinals.set(target.kind, ordinal + 1);
      const progressing = progresses(target.kind);
      if (!progressing && (!loaded || !SCALED_KINDS.includes(target.kind))) continue;
      const before = progressing
        ? saved.get(index)?.before
        : last?.logged.filter(({ kind }) => kind === target.kind)[ordinal];
      if (!before || (!progressing && before.weight_kg == null)) continue;
      const weightKg =
        before.weight_kg == null
          ? null
          : lightenLoad(
              before.weight_kg,
              factor,
              equipment,
              unit,
              grid,
              phaseDecides ? "deload" : "nearest",
            );
      outcomes[index] = {
        reason: resetReason,
        loadFactor: weightKg !== null && before.weight_kg ? weightKg / before.weight_kg : undefined,
      };
      // A reset that cannot lower the load must not raise the reps either.
      const lowered = weightKg !== null && before.weight_kg != null && weightKg < before.weight_kg;
      const reset = target.reps_min ?? before.reps ?? null;
      sets[index] = {
        weightKg,
        reps: !progressing
          ? null
          : !lowered && reset !== null && before.reps != null
            ? Math.min(reset, before.reps)
            : reset,
      };
    }
    // Where the grid moved a load further than the share says (a 12.5 kg dumbbell down to 10).
    const moved = [...slots].flatMap(({ index }) => {
      const from = saved.get(index)?.before?.weight_kg;
      const to = sets[index]?.weightKg;
      return from && to != null && Math.abs(1 - to / from - (1 - factor)) >= SNAP_POINTS
        ? [{ source: "grid" as const, fromKg: from, toKg: to }]
        : [];
    })[0];
    return {
      reason: resetReason,
      sets,
      outcomes,
      incrementKg: incrementFor(null, equipment, increments, grid),
      breakDays: resetReason === "after_break" ? breakDays : null,
      evidence: {
        baseline,
        factor: {
          source: resetReason === "after_break" ? "break" : "deload",
          share: factor,
          ...(resetReason === "after_break" ? { days: breakDays } : {}),
        },
        ...(moved ? { snapped: moved } : {}),
      },
    };
  }

  const proposal = ruleFor(config).propose({
    config,
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
  });
  // A load above the gym's cap came down to it: say so.
  const capped = slots.flatMap(({ index }) => {
    const from = saved.get(index)?.before?.weight_kg;
    const outcome = proposal.outcomes[index];
    return from != null && outcome?.reason === "capped" && outcome.capKg !== undefined
      ? [{ source: "cap" as const, fromKg: from, toKg: outcome.capKg }]
      : [];
  })[0];
  return { ...proposal, evidence: { baseline, ...(capped ? { snapped: capped } : {}) } };
}
