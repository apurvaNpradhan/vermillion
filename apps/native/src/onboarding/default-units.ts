import type { WeightUnit } from "@workspace/shared";

export type LengthUnit = "cm" | "in";
export type Units = { weightUnit: WeightUnit; lengthUnit: LengthUnit };

/** Regions that weigh in pounds and measure in inches. */
const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);

/**
 * The units a phone's region suggests: pounds and inches where the US system is used, kilograms
 * and centimetres everywhere else (the UK included: gym plates there are in kilograms).
 */
export function defaultUnits(locale: {
  measurementSystem?: string | null;
  regionCode?: string | null;
}): Units {
  const imperial =
    locale.measurementSystem === "us" || IMPERIAL_REGIONS.has(locale.regionCode ?? "");
  return imperial ? { weightUnit: "lb", lengthUnit: "in" } : { weightUnit: "kg", lengthUnit: "cm" };
}
