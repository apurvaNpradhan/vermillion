import type { Progression } from "@workspace/shared";

/** The short label of a suggestion: "Add 2.5 kg", "One more rep". */
export function progressionLabelKey(reason: Progression["reason"]) {
  switch (reason) {
    case "add_weight":
      return "progress__label_add_weight";
    case "add_rep":
      return "progress__label_add_rep";
    case "hold":
      return "progress__label_hold";
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
export function progressionReasonKey(reason: Progression["reason"]) {
  switch (reason) {
    case "add_weight":
      return "progress__reason_add_weight";
    case "add_rep":
      return "progress__reason_add_rep";
    case "hold":
      return "progress__reason_hold";
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
export const breakWeeks = (progression: Progression) =>
  Math.max(2, Math.floor((progression.breakDays ?? 14) / 7));
