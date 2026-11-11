import type { EffortScale, SetKind, WeightUnit } from "./vocabulary";

// Written out as literals so `pnpm i18n:report` sees every key as used.

export const SET_KIND_KEYS = {
  warmup: "training__set_kind_warmup",
  working: "training__set_kind_working",
  drop: "training__set_kind_drop",
  failure: "training__set_kind_failure",
  top: "training__set_kind_top",
  backoff: "training__set_kind_backoff",
  myo: "training__set_kind_myo",
} as const satisfies Record<SetKind, string>;

/** Short name of each effort scale, as shown next to a value ("RPE 8"). */
export const EFFORT_SCALE_KEYS = {
  rpe: "training__effort_rpe",
  rir: "training__effort_rir",
} as const satisfies Record<EffortScale, string>;

/** Longer explanation of each effort scale, for the preference. */
export const EFFORT_SCALE_NAME_KEYS = {
  rpe: "training__effort_rpe_name",
  rir: "training__effort_rir_name",
} as const satisfies Record<EffortScale, string>;

export const WEIGHT_UNIT_KEYS = {
  kg: "training__unit_kg",
  lb: "training__unit_lb",
} as const satisfies Record<WeightUnit, string>;
