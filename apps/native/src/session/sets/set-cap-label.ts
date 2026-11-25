import { cappedRepCeiling } from "@workspace/shared";

/** The set's current load determines whether it needs an inline cap label. */
export function setCapLabel({
  capKg,
  kg,
  reps,
  repMax,
}: {
  capKg: number | null;
  kg: number | null | undefined;
  reps: number | null | undefined;
  repMax: number | undefined;
}) {
  if (capKg === null || kg == null || Math.abs(kg - capKg) > 0.0005) return null;
  return repMax !== undefined && reps != null && reps >= cappedRepCeiling(repMax)
    ? "progress__label_cap_hint"
    : "progress__label_cap_reps";
}
