import {
  formatWeight,
  type Progression,
  type SetOutcome,
  type WeightUnit,
} from "@workspace/shared";

/** The short label of a suggestion: "Add 2.5 kg", "One more rep". */
export function progressionLabelKey({ reason, limit, loadFactor }: SetOutcome) {
  if (loadFactor !== undefined && reason === "after_break")
    return "progress__label_after_break_load";
  if (loadFactor !== undefined && reason === "deload") return "progress__label_deload_load";
  if (limit === "plates") {
    if (reason === "capped") return "progress__label_capped_plates";
    if (reason === "cap_reps") return "progress__label_cap_reps_plates";
    if (reason === "cap_hint") return "progress__label_cap_hint_plates";
  }
  switch (reason) {
    case "add_weight":
      return "progress__label_add_weight";
    case "add_rep":
      return "progress__label_add_rep";
    case "reset":
      return "progress__label_reset";
    case "hold_missed":
      return "progress__label_hold_missed";
    case "hold_together":
      return "progress__label_hold_together";
    case "hold_effort":
      return "progress__label_hold_effort";
    case "after_break":
      return "progress__label_after_break";
    case "same_as_last":
      return "progress__label_same_as_last";
    case "deload":
      return "progress__label_deload";
    case "capped":
      return "progress__label_capped";
    case "cap_reps":
      return "progress__label_cap_reps";
    case "cap_hint":
      return "progress__label_cap_hint";
  }
}

/** The longer explanation of a suggestion. */
export function progressionReasonKey({ reason, loadFactor, limit }: SetOutcome) {
  if (limit === "plates") {
    if (reason === "capped") return "progress__reason_capped_plates";
    if (reason === "cap_reps") return "progress__reason_cap_reps_plates";
    if (reason === "cap_hint") return "progress__reason_cap_hint_plates";
  }
  if (loadFactor === undefined && reason === "after_break") return "progress__reason_break_reps";
  if (loadFactor === undefined && reason === "deload") return "progress__reason_deload_reps";
  switch (reason) {
    case "add_weight":
      return "progress__reason_add_weight";
    case "add_rep":
      return "progress__reason_add_rep";
    case "reset":
      return "progress__reason_reset";
    case "hold_missed":
      return "progress__reason_hold_missed";
    case "hold_together":
      return "progress__reason_hold_together";
    case "hold_effort":
      return "progress__reason_hold_effort";
    case "after_break":
      return "progress__reason_after_break";
    case "same_as_last":
      return "progress__reason_same_as_last";
    case "deload":
      return "progress__reason_deload";
    case "capped":
      return "progress__reason_capped";
    case "cap_reps":
      return "progress__reason_cap_reps";
    case "cap_hint":
      return "progress__reason_cap_hint";
  }
}

/** Weeks of a break for the label, at least two (a break starts at 14 days). */
const breakWeeks = (progression: Progression) =>
  Math.max(2, Math.floor((progression.breakDays ?? 14) / 7));

export function progressionParams(progression: Progression, outcome: SetOutcome, unit: WeightUnit) {
  return {
    value: formatWeight(
      (outcome.reason === "capped" ? outcome.capKg : outcome.changeKg) ?? 0,
      unit,
    ),
    unit,
    count: breakWeeks(progression),
    percent: Math.round((outcome.loadFactor ?? 1) * 100),
  };
}
