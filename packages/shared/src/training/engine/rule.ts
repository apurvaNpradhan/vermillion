import type { Equipment, ExerciseType } from "../../exercise/vocabulary";
import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import type { WeightUnit } from "../vocabulary/vocabulary";
import type { LoadGrid } from "../progress/load-grid";
import type {
  IncrementSettings,
  Progression,
  ProgressionContext,
  SetOutcome,
  SuggestedSet,
} from "../progress/progression";
import type { RuleConfig, RuleId } from "./rule-config";
import type { Slot } from "./slots";

/** The sets of the baseline Session that a planned set is compared with. */
export type SavedSet = {
  /** The set at the same kind and place last time. */
  exact: LoggedSet | undefined;
  /** The exact set, else the last one of its kind (a slot added since has no counterpart). */
  before: LoggedSet | undefined;
  /** The same place in the Session before the baseline. */
  prior: LoggedSet | undefined;
};

/** The newest baseline Session's Counted sets: the progressing ones, and all of them. */
export type Baseline = {
  sets: readonly LoggedSet[];
  logged: readonly LoggedSet[];
  /** The Session's id, when the history carries one, and when it started. */
  id?: string;
  at: string;
};

/** What a rule reads once the shared stages (eligibility, baseline, resets) have run. */
export type RuleInput<Config extends RuleConfig = RuleConfig> = {
  config: Config;
  planned: readonly PlannedSet[];
  slots: readonly Slot[];
  saved: ReadonlyMap<number, SavedSet>;
  last: Baseline | undefined;
  type: ExerciseType;
  equipment: Equipment;
  unit: WeightUnit;
  /** The exercise moves a load (weighted or weighted bodyweight). */
  loaded: boolean;
  settings: IncrementSettings;
  /** The increment settings with the exercise type, for {@link incrementFor}. */
  increments: IncrementSettings & { exerciseType: ExerciseType };
  context: ProgressionContext;
  grid: LoadGrid | null;
  /** The gym's cap in kilograms, for a loaded exercise. */
  cap: number | null;
  /** The cap as a typed weight in the exercise's unit. */
  roundedCap: number | null;
};

/** One planned set's next target and why. */
export type Proposal = { set: SuggestedSet | null; outcome: SetOutcome | null };

/**
 * A named way of choosing the next load and reps. The pipeline has already picked the baseline
 * and applied breaks, Deloads and the Test single; a rule decides what progression means, and
 * gets the shared effort, cap and snapping helpers. Adding a rule is a file here, an entry in
 * the registry, a variant of {@link RuleConfig} and a simulation test.
 */
export type ProgressionRule<Config extends RuleConfig = RuleConfig> = {
  id: Config["id"];
  propose(input: RuleInput<Config>): Progression;
};

export type { RuleConfig, RuleId };
