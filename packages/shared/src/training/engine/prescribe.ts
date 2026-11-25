import type { PlannedSet } from "../plans/planned-sets";
import type { Prescription } from "../progress/prescription";
import type { Progression } from "../progress/progression";
import {
  suggestionContext,
  type ContextSession,
  type StallInfo,
  type SuggestionAccount,
  type SuggestionPlace,
  type SuggestionSettings,
} from "../progress/suggestion-context";
import type { WeightUnit } from "../vocabulary/vocabulary";
import { suggestNext } from "./pipeline";
import { DEFAULT_RULE, type RuleConfig } from "./rule-config";

/** What the engine needs to prescribe one exercise, however the surface came by it. */
export type PrescribeInput = {
  /** Where and with what the exercise is trained: Workout, gym, grid, phase, stall flags. */
  place: Omit<SuggestionPlace, "prescription">;
  /** The sets to prescribe for, as the Session has them (the phase already applied). */
  plan: readonly PlannedSet[];
  /** The exercise's finished Sessions, newest first, across Workouts and gyms. */
  history: readonly ContextSession[];
  /** Preferences, the weight log and the device's stall memory. */
  account: SuggestionAccount;
  /** The exercise's progression rule; none is Double. */
  rule?: RuleConfig | null;
  /** Each set progresses alone instead of waiting for the others to reach the range's top. */
  progressionPerSet?: boolean;
  now?: Date;
  /**
   * The Session's own snapshot of what it suggested, with the set ids of `plan` in order. A readable
   * snapshot is the answer: nothing is recomputed, so a Session never moves under the lifter.
   */
  snapshot?: { prescription: Prescription | null | undefined; setIds: readonly string[] };
  /** False reads the context (Previous, stall verdict) without suggesting anything. */
  suggest?: boolean;
};

export type Prescribed = {
  unit: WeightUnit;
  /** The rule that decided, with its settings. */
  rule: RuleConfig;
  /** The baseline Sessions, the grid and the factors the surface reads Previous and ghosts from. */
  settings: SuggestionSettings;
  history: readonly ContextSession[];
  /** The stalled-lift verdict of this exercise; null when none, dismissed or the rule is Maintain. */
  stall: StallInfo | null;
  /** Per-set targets, outcomes with reasons, and the evidence they rest on. */
  progression: Progression | null;
  /** Where the progression came from: computed now, or read back from the Session's snapshot. */
  source: "computed" | "snapshot";
};

/** The progression of a Session's snapshot, set by set in the order of `setIds`. */
export function progressionFromSnapshot(
  snapshot: Prescription,
  setIds: readonly string[],
): Progression | null {
  if (!snapshot.reason) return null;
  const sets = setIds.map((id) => snapshot.sets.find((set) => set.id === id));
  return {
    reason: snapshot.reason,
    incrementKg: snapshot.incrementKg,
    breakDays: snapshot.breakDays,
    sets: sets.map((set) =>
      set ? { weightKg: set.ghosts.weight ?? null, reps: set.ghosts.reps ?? null } : null,
    ),
    outcomes: sets.map((set) =>
      set?.unadjustedWeightKg === undefined ? (set?.outcome ?? null) : null,
    ),
  };
}

/**
 * The one entry point every surface asks for a prescription: the Session, the live notification,
 * the Workout preview, the exercise page and Home's stall nudge. It builds the context (baseline,
 * stall verdict, applied deload, Lighter weeks, phase and grid) the same way for all of them, then
 * runs the pipeline with the exercise's rule. Pure: the clock, the weight log and the device's stall
 * memory come in as values.
 */
export function prescribe(input: PrescribeInput): Prescribed {
  const rule = input.rule ?? DEFAULT_RULE;
  const context = suggestionContext(
    input.history,
    { ...input.place, prescription: input.plan, rule: rule.id },
    input.account,
  );
  const base = {
    unit: context.unit,
    rule,
    settings: context.settings,
    history: context.history,
    stall: context.stall,
  };
  if (input.suggest === false) return { ...base, progression: null, source: "computed" };
  const snapshot = input.snapshot?.prescription;
  if (snapshot) {
    return {
      ...base,
      progression: progressionFromSnapshot(snapshot, input.snapshot?.setIds ?? []),
      source: "snapshot",
    };
  }
  const { settings } = context;
  const progression = suggestNext(
    input.plan,
    input.history,
    input.place.type,
    input.place.equipment,
    { ...settings, progressionPerSet: input.progressionPerSet === true },
    {
      now: input.now ?? new Date(),
      bodyweightKg: settings.bodyweightKg,
      baselineHistory: context.history,
      fixedBaselineHistory: settings.fixedBaselineHistory,
      fixedFallbackHistory: settings.fixedFallbackHistory,
      lighterWeeks: settings.lighterWeeks,
      deload: settings.deload,
      phaseLoad: settings.phaseLoad,
      testSingle: settings.testSingle,
      grid: settings.grid,
    },
    rule,
  );
  return { ...base, progression, source: "computed" };
}
