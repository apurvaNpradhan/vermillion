import { measurementInput, type MeasurementInput } from "@workspace/shared";
import { eq } from "drizzle-orm";

import { DEVICE_OWNER_ID } from "../platform/device-owner";
import { deviceOwner } from "../platform/tables";
import { writeMedia, type MediaDatabase } from "../media";
import { insertProgressPhoto, type NewProgressPhoto } from "./photo-store";
import { insertMeasurement } from "./store";

/**
 * Saves a Check-in that has photos (ADR 0041): its measurements, and each photo's media row and
 * photo, in ONE local transaction. Either all of it is written or none is, so a refused photo
 * can neither leave a half Check-in behind nor force a retry that logs the measurements twice, and
 * it uploads as one unit. The photos' files are in the attachment queue already (files first, row
 * after); the caller discards them when this throws. A Check-in with no photos keeps logging each
 * measurement in its own transaction (`logMeasurements`), so one rejected site cannot take the
 * others with it.
 */
export async function saveCheckIn(
  database: MediaDatabase,
  input: { measurements: readonly MeasurementInput[]; photos: readonly NewProgressPhoto[] },
  expectedInstallId?: string,
): Promise<{ measurementIds: string[]; photoIds: string[] }> {
  const measurements = input.measurements.map((entry) => measurementInput.parse(entry));
  return writeMedia(database, expectedInstallId, async (tx) => {
    const [owner] = await tx
      .select({ userId: deviceOwner.user_id })
      .from(deviceOwner)
      .where(eq(deviceOwner.id, DEVICE_OWNER_ID))
      .limit(1);
    if (!owner) throw new Error("No Device owner: sign in first");
    const measurementIds: string[] = [];
    for (const entry of measurements) {
      measurementIds.push(await insertMeasurement(tx, owner.userId, entry));
    }
    const photoIds: string[] = [];
    for (const photo of input.photos) photoIds.push(await insertProgressPhoto(tx, photo));
    return { measurementIds, photoIds };
  });
}
