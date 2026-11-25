import { z } from "zod";

import { MAX_WEIGHT_KG } from "../training/vocabulary/vocabulary";
import { EQUIPMENT, type Equipment } from "./vocabulary";

/** Equipment every gym has: bodyweight needs nothing, so it is never ticked off. */
export const ALWAYS_AVAILABLE_EQUIPMENT: readonly Equipment[] = ["none"];

/** The equipment a gym can lack, in the order the tick list shows it. */
export const GYM_EQUIPMENT_CHOICES: readonly Equipment[] = EQUIPMENT.filter(
  (equipment) => !ALWAYS_AVAILABLE_EQUIPMENT.includes(equipment),
);

/** The equipment a gym does not have, each at most once. A new gym has all of it, so this is `[]`. */
export const unavailableEquipmentSchema = z
  .array(z.enum(EQUIPMENT).refine((equipment) => GYM_EQUIPMENT_CHOICES.includes(equipment)))
  .max(GYM_EQUIPMENT_CHOICES.length)
  .refine((list) => new Set(list).size === list.length, "Each equipment type appears once");

/** What a gym says about its kit of equipment: what it lacks and its heaviest dumbbell. */
export const gymAvailabilityInput = z.strictObject({
  unavailable_equipment: unavailableEquipmentSchema,
  /** Kilograms; null for no limit. */
  dumbbell_max_kg: z.number().positive().max(MAX_WEIGHT_KG).nullable(),
});
export type GymAvailabilityInput = z.infer<typeof gymAvailabilityInput>;

/** Whether a gym that lacks `unavailable` has `equipment`. Bodyweight is always there. */
export function isEquipmentAvailable(
  equipment: Equipment,
  unavailable: readonly Equipment[],
): boolean {
  return ALWAYS_AVAILABLE_EQUIPMENT.includes(equipment) || !unavailable.includes(equipment);
}
