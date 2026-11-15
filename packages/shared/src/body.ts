import { z } from "zod";

// Safety: an immutable vocabulary tuple preserves the validated metric literals.
export const BODY_METRICS = [
  "weight",
  "neck",
  "shoulders",
  "chest",
  "waist",
  "hips",
  "left_bicep",
  "right_bicep",
  "left_forearm",
  "right_forearm",
  "left_thigh",
  "right_thigh",
  "left_calf",
  "right_calf",
] as const; // safety: immutable vocabulary, no runtime narrowing.
export type BodyMetric = (typeof BODY_METRICS)[number];
export const BODY_GROUPS = {
  upper: ["neck", "shoulders", "chest", "waist", "hips"],
  arms: ["left_bicep", "right_bicep", "left_forearm", "right_forearm"],
  legs: ["left_thigh", "right_thigh", "left_calf", "right_calf"],
} satisfies { upper: BodyMetric[]; arms: BodyMetric[]; legs: BodyMetric[] };
export const DEFAULT_TRACKED_METRICS: BodyMetric[] = [
  "waist",
  "chest",
  "left_bicep",
  "right_bicep",
  "left_thigh",
  "right_thigh",
];
export const BODY_LIMITS = {
  weightMin: 20,
  weightMax: 400,
  siteMin: 5,
  siteMax: 250,
  backfillYears: 10,
};
export function validMeasurementDate(date: string, today = new Date().toISOString().slice(0, 10)) {
  const oldest = new Date(`${today}T00:00:00Z`);
  oldest.setUTCFullYear(oldest.getUTCFullYear() - BODY_LIMITS.backfillYears);
  return date <= today && date >= oldest.toISOString().slice(0, 10);
}
/**
 * Whether a capture instant and the calendar date it was made on agree and are plausible: not in
 * the future, within the backfill window, and a day apart at most (a local day may be one day
 * ahead of or behind the UTC instant). Shared by measurements and progress photos.
 */
export function plausibleCaptureDate(takenAt: string, localDate: string, now = Date.now()) {
  const taken = Date.parse(takenAt);
  if (!Number.isFinite(taken)) return false;
  const utcDay = new Date(taken).toISOString().slice(0, 10);
  const offset = Date.parse(localDate) - Date.parse(utcDay);
  if (taken > now || Math.abs(offset) > 86400000) return false;
  return validMeasurementDate(localDate, new Date(now + offset).toISOString().slice(0, 10));
}
const measurementFields = z.strictObject({
  metric: z.enum(BODY_METRICS),
  value: z.number().finite(),
  measured_at: z.iso.datetime({ offset: true }),
  local_date: z.iso.date(),
  source: z.enum(["manual", "health"]).default("manual"),
});
export const measurementPatch = measurementFields
  .partial()
  .extend({ source: z.enum(["manual", "health"]).optional() });
export const measurementInput = measurementFields
  .refine(
    (v) =>
      v.value >= (v.metric === "weight" ? 20 : 5) && v.value <= (v.metric === "weight" ? 400 : 250),
    { path: ["value"], message: "Measurement out of range" },
  )
  .refine((v) => plausibleCaptureDate(v.measured_at, v.local_date), {
    path: ["local_date"],
    message: "Measurement date out of range",
  });
export type MeasurementInput = z.infer<typeof measurementInput>;
export * from "./body/weight";
export * from "./body/zoned-time";
export const PROGRESS_POSES = ["front", "side", "back"] as const;
export type ProgressPose = (typeof PROGRESS_POSES)[number];

/** What one `progress_photo` row says (ADR 0041); the image itself is the `media` it points at. */
export const progressPhotoInput = z
  .strictObject({
    media_id: z.uuid(),
    pose: z.enum(PROGRESS_POSES),
    local_date: z.iso.date(),
    taken_at: z.iso.datetime({ offset: true }),
  })
  .refine((v) => plausibleCaptureDate(v.taken_at, v.local_date), {
    path: ["local_date"],
    message: "Photo date out of range",
  });
export type ProgressPhotoInput = z.infer<typeof progressPhotoInput>;
export * from "./body/measurements";
export * from "./body/photos";
