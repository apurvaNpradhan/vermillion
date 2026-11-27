import type { Equipment } from "../../exercise/vocabulary";
import { barKitFor, type KitRow } from "../plates/bar-choice";
import { resolveExerciseUnit, type WeightUnit } from "../vocabulary/vocabulary";
import {
  gymRangesFor,
  limitsOfRanges,
  loadGridOf,
  type LoadGrid,
  type LoadRange,
} from "./load-grid";

/**
 * The loads one gym gives each exercise, from its exercise settings and its kit. A barbell loads
 * with its own bar: the one the exercise remembers when this gym has it, else the gym's default
 * bar (a bar remembered from another gym is not in `kit`). Grids are made once per exercise and
 * equipment. Used by the screens and by the Session store, so a Session starts on the same
 * loads the screens show.
 */
export function gymGridsOf(input: {
  settings: readonly { exerciseId: string; loadRanges: readonly LoadRange[] }[];
  kit: readonly KitRow[];
  /** The bar each exercise remembers, by exercise id. */
  bars?: ReadonlyMap<string, string>;
  unit: WeightUnit;
  /** The heaviest dumbbell of the gym in kilograms; it caps every dumbbell exercise. */
  dumbbellMaxKg?: number | null;
}) {
  const byExercise = new Map(input.settings.map((setting) => [setting.exerciseId, setting]));
  const grids = new Map<string, LoadGrid | null>();
  const dumbbellMaxKg = input.dumbbellMaxKg ?? null;
  return {
    /** The ranges the gym gives an exercise, held to the dumbbell max for dumbbell exercises. */
    rangesFor: (exerciseId: string, equipment: Equipment) =>
      gymRangesFor({ equipment, ranges: byExercise.get(exerciseId)?.loadRanges, dumbbellMaxKg }),
    /** The loads the gym can make for an exercise; null is the equipment's default step. */
    gridFor(
      exerciseId: string,
      equipment: Equipment,
      override?: WeightUnit | null,
    ): LoadGrid | null {
      const unit = resolveExerciseUnit(input.unit, override);
      const key = `${exerciseId}|${equipment}|${override ?? ""}`;
      if (!grids.has(key)) {
        const ranges = byExercise.get(exerciseId)?.loadRanges;
        const kit =
          equipment === "barbell"
            ? barKitFor(input.kit, {
                unit,
                equipment,
                rememberedId: input.bars?.get(exerciseId),
                capKg: limitsOfRanges(ranges ?? []).maxKg,
                preferMatchingUnit: override != null,
              })
            : null;
        grids.set(
          key,
          loadGridOf({
            equipment,
            unit,
            ranges,
            dumbbellMaxKg,
            bar: kit?.bar,
            plates: kit?.plates,
          }),
        );
      }
      return grids.get(key) ?? null;
    },
  };
}
