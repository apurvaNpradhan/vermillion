import { inToCm, lbToKg, type WeightUnit } from "@workspace/shared";

import type { LengthUnit } from "./default-units";

export type BodyDraft = { heightCm: string; feet: string; inches: string; weight: string };
export type BodyField = "height" | "weight";
export type BodyValues = { heightCm: number | null; bodyweightKg: number | null };
export type BodyResult = { ok: true; values: BodyValues } | { ok: false; invalid: BodyField[] };

/** Typed text to a number; null when empty, NaN when it is not a number. A comma is a point. */
function numberOf(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

const within = (value: number | null, min: number, max: number) =>
  value === null || (Number.isFinite(value) && value >= min && value <= max);

/**
 * What the body step typed, as stored values: a height in centimetres (100 to 250) and a
 * bodyweight in kilograms (20 to 400), the ranges the preferences accept. Either may be left
 * empty. A height in the inch system is feet and inches; inches alone are not a height.
 */
export function parseBody(
  draft: BodyDraft,
  units: { weightUnit: WeightUnit; lengthUnit: LengthUnit },
): BodyResult {
  const feet = numberOf(draft.feet);
  const inches = numberOf(draft.inches);
  const heightCm =
    units.lengthUnit === "cm"
      ? numberOf(draft.heightCm)
      : feet === null
        ? inches === null
          ? null
          : Number.NaN
        : inToCm(feet * 12 + (inches ?? 0));
  const typedWeight = numberOf(draft.weight);
  const bodyweightKg =
    typedWeight === null ? null : units.weightUnit === "lb" ? lbToKg(typedWeight) : typedWeight;
  const invalid: BodyField[] = [];
  if (!within(heightCm, 100, 250) || (inches !== null && !(inches >= 0 && inches < 12))) {
    invalid.push("height");
  }
  if (!within(bodyweightKg, 20, 400)) invalid.push("weight");
  if (invalid.length > 0) return { ok: false, invalid };
  const round = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);
  return { ok: true, values: { heightCm: round(heightCm), bodyweightKg: round(bodyweightKg) } };
}
