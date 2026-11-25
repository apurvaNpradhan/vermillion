import { describe, expect, it } from "vitest";

import {
  GYM_EQUIPMENT_CHOICES,
  gymAvailabilityInput,
  isEquipmentAvailable,
  unavailableEquipmentSchema,
} from "./availability";
import { EQUIPMENT } from "./vocabulary";

describe("equipment availability", () => {
  it("offers every type but bodyweight to tick off", () => {
    expect(GYM_EQUIPMENT_CHOICES).toHaveLength(EQUIPMENT.length - 1);
    expect(GYM_EQUIPMENT_CHOICES).not.toContain("none");
  });

  it.each([
    { equipment: "barbell", unavailable: [], here: true },
    { equipment: "barbell", unavailable: ["barbell"], here: false },
    { equipment: "dumbbell", unavailable: ["barbell"], here: true },
    { equipment: "none", unavailable: [], here: true },
    { equipment: "none", unavailable: ["machine", "cable"], here: true },
    { equipment: "cable", unavailable: ["machine", "cable"], here: false },
  ] as const)(
    "$equipment with $unavailable lacking is $here",
    ({ equipment, unavailable, here }) => {
      expect(isEquipmentAvailable(equipment, unavailable)).toBe(here);
    },
  );

  it.each([
    { name: "an empty list", value: [], ok: true },
    { name: "a few types", value: ["cable", "machine"], ok: true },
    { name: "bodyweight", value: ["none"], ok: false },
    { name: "an unknown type", value: ["sled"], ok: false },
    { name: "a repeated type", value: ["cable", "cable"], ok: false },
  ])("validates $name", ({ value, ok }) => {
    expect(unavailableEquipmentSchema.safeParse(value).success).toBe(ok);
  });

  it.each([
    { name: "no max", dumbbell_max_kg: null, ok: true },
    { name: "a max", dumbbell_max_kg: 45, ok: true },
    { name: "zero", dumbbell_max_kg: 0, ok: false },
    { name: "too heavy", dumbbell_max_kg: 5000, ok: false },
  ])("validates the dumbbell max: $name", ({ dumbbell_max_kg, ok }) => {
    expect(
      gymAvailabilityInput.safeParse({ unavailable_equipment: [], dumbbell_max_kg }).success,
    ).toBe(ok);
  });
});
