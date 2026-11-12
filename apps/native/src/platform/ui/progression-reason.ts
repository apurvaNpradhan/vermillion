import type { Progression } from "@workspace/shared";

export function progressionReasonKey(reason: Progression["reason"]) {
  switch (reason) {
    case "add_weight":
      return "progress__add_weight_reason";
    case "add_rep":
      return "progress__add_rep_reason";
    case "hold":
      return "progress__hold_reason";
    case "same_as_last":
      return "progress__same_reason";
  }
}
