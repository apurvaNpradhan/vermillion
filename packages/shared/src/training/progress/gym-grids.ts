import type { Equipment } from "../../exercise/vocabulary";
import { defaultBar, enabledBars, platesForBar, type KitRow } from "../plates/bar-choice";
import { resolveExerciseUnit, type WeightUnit } from "../vocabulary/vocabulary";
import { gymRangesFor, loadGridOf, type LoadGrid, type LoadRange } from "./load-grid";

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
  const bars = enabledBars(input.kit);
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
        const bar =
          equipment === "barbell"
            ? defaultBar(bars, input.bars?.get(exerciseId), unit, equipment, override != null)
            : undefined;
        grids.set(
          key,
          loadGridOf({
            equipment,
            unit,
            ranges: byExercise.get(exerciseId)?.loadRanges,
            dumbbellMaxKg,
            bar,
            plates: bar ? platesForBar(input.kit, bar) : [],
          }),
        );
      }
      return grids.get(key) ?? null;
    },
  };
}
