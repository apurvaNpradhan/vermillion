import { expect, it } from "vitest";

import { setCapLabel } from "./set-cap-label";

it("keeps the set row quiet without a cap or when lifting away from it", () => {
  expect(setCapLabel({ capKg: null, kg: 90, reps: 12, repMax: 12 })).toBeNull();
  expect(setCapLabel({ capKg: 90, kg: 87, reps: 12, repMax: 12 })).toBeNull();
  expect(setCapLabel({ capKg: 90, kg: 92, reps: 12, repMax: 12 })).toBeNull();
});

it("shows reps at the max until the rounded extended ceiling is reached", () => {
  expect(setCapLabel({ capKg: 90, kg: 90, reps: 16, repMax: 11 })).toBe("progress__label_cap_reps");
  expect(setCapLabel({ capKg: 90, kg: 90, reps: 17, repMax: 11 })).toBe("progress__label_cap_hint");
  expect(setCapLabel({ capKg: 90, kg: 90, reps: 20, repMax: 11 })).toBe("progress__label_cap_hint");
  expect(setCapLabel({ capKg: 90, kg: 90, reps: null, repMax: undefined })).toBe(
    "progress__label_cap_reps",
  );
});
