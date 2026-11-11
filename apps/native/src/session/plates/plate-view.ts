import {
  defaultGymKit,
  KG_PER_LB,
  type BarLoad,
  type BarLoading,
  type GymEquipmentInput,
  type LoadPlate,
  type WeightUnit,
} from "@workspace/shared";
import type { EquipmentRow } from "@workspace/sync";

/** Pure view logic of the plate calculator and the equipment screen. */

/** Kilograms of difference below which two weights are the same load. */
const SAME = 0.0005;

/** The enabled bars, in the stored order. */
export function enabledBars(rows: readonly EquipmentRow[]): EquipmentRow[] {
  return rows.filter((row) => row.kind === "bar" && row.enabled);
}

/** The plates the solver may use for a bar: enabled, and in the bar's own unit. */
export function platesForBar(
  rows: readonly EquipmentRow[],
  bar: Pick<EquipmentRow, "unit">,
): LoadPlate[] {
  return rows.flatMap((row) =>
    row.kind === "plate" && row.enabled && row.unit === bar.unit
      ? [{ id: row.id, weightKg: row.weightKg, count: row.count }]
      : [],
  );
}

const STANDARD_BAR_KG = { kg: 20, lb: 45 * KG_PER_LB } as const satisfies Record<
  WeightUnit,
  number
>;

/**
 * The bar the calculator starts on: the one the exercise remembers if it is still enabled, else
 * the standard bar of the preferred unit (20 kg, 45 lb), else the first bar of that unit, else
 * the first bar.
 */
export function defaultBar(
  bars: readonly EquipmentRow[],
  rememberedId: string | null | undefined,
  preferred: WeightUnit,
): EquipmentRow | undefined {
  const remembered = rememberedId ? bars.find((bar) => bar.id === rememberedId) : undefined;
  if (remembered) return remembered;
  const inUnit = bars.filter((bar) => bar.unit === preferred);
  return (
    inUnit.find((bar) => Math.abs(bar.weightKg - STANDARD_BAR_KG[preferred]) < SAME) ??
    inUnit[0] ??
    bars[0]
  );
}

/** A target the calculator can work with; zero or empty asks the user to enter a weight. */
export function hasTarget(targetKg: number): boolean {
  return Number.isFinite(targetKg) && targetKg > 0;
}

export type LoadSide = "below" | "above";
export type LoadChoice = { side: LoadSide; load: BarLoad; differenceKg: number };

/**
 * The loads the user can pick between. An exact result is the single choice; otherwise the
 * nearest load below and above the target, each with its signed distance from it (negative is
 * under the target). A target below the bar has only the bare bar, as the `above` choice.
 */
export function loadChoices(targetKg: number, result: BarLoading): LoadChoice[] {
  if (result.exact) {
    const load = result.below ?? result.above ?? result;
    return [{ side: "below", load, differenceKg: 0 }];
  }
  const choices: LoadChoice[] = [];
  if (result.below)
    choices.push({
      side: "below",
      load: result.below,
      differenceKg: result.below.totalKg - targetKg,
    });
  if (result.above)
    choices.push({
      side: "above",
      load: result.above,
      differenceKg: result.above.totalKg - targetKg,
    });
  return choices;
}

/** The nearest choice to the target; a tie goes to the lower load. Null with no choices. */
export function nearestChoice(choices: readonly LoadChoice[]): LoadChoice | null {
  let best: LoadChoice | null = null;
  for (const choice of choices) {
    if (
      !best ||
      Math.abs(choice.differenceKg) < Math.abs(best.differenceKg) - SAME ||
      (Math.abs(Math.abs(choice.differenceKg) - Math.abs(best.differenceKg)) <= SAME &&
        choice.differenceKg < best.differenceKg)
    )
      best = choice;
  }
  return best;
}

/** The choice shown: the user's pick if it still exists, else the nearest. */
export function selectedChoice(
  choices: readonly LoadChoice[],
  picked: LoadSide | null,
): LoadChoice | null {
  return choices.find((choice) => choice.side === picked) ?? nearestChoice(choices);
}

/** A distance between two loads in a unit, without sign: "1.5", "0.25". */
export function formatDifference(kg: number, unit: WeightUnit): string {
  const shown = Math.abs(unit === "kg" ? kg : kg / KG_PER_LB);
  return String(Number(shown.toFixed(2)));
}

/** Equal consecutive plates folded together: `[20, 20, 5]` is two 20s and a 5. */
export function plateGroups(plates: readonly LoadPlate[]): { weightKg: number; count: number }[] {
  const groups: { weightKg: number; count: number }[] = [];
  for (const plate of plates) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.weightKg - plate.weightKg) < SAME) last.count += 1;
    else groups.push({ weightKg: plate.weightKg, count: 1 });
  }
  return groups;
}

const FIRST_PLATE_X = 55;
const PLATE_GAP = 2;
const BAR_END_PAD = 28;
const MIN_WIDTH = 150;
const LABEL_CHAR = 6;
const LABEL_PAD = 6;

/** Narrower for light plates, so a drawing reads as the real stack and does not overflow. */
export function plateWidth(weightKg: number): number {
  return Math.min(36, 12 + weightKg * 1.5);
}

/** Whether a plate's label fits inside its drawn width at 10pt. */
export function labelFits(width: number, label: string): boolean {
  return width >= label.length * LABEL_CHAR + LABEL_PAD;
}

export type PlateLayout = { slots: PlateSlot[]; width: number };
export type PlateSlot = { x: number; width: number; showLabel: boolean };

/**
 * Where each plate is drawn: stacked from the collar, each against the last. The drawing is as
 * wide as the actual stack, and a plate too narrow for its label has none (the per-side text
 * names every plate).
 */
export function plateLayout(
  plates: readonly LoadPlate[],
  label: (weightKg: number) => string,
): PlateLayout {
  let x = FIRST_PLATE_X;
  const slots = plates.map((plate) => {
    const width = plateWidth(plate.weightKg);
    const slot = { x, width, showLabel: labelFits(width, label(plate.weightKg)) };
    x += width + PLATE_GAP;
    return slot;
  });
  return { slots, width: Math.max(MIN_WIDTH, x - PLATE_GAP + BAR_END_PAD) };
}

/** A key that changes only when the bar or a plate that matters to the solver changes. */
export function loadInputKey(
  bar: Pick<EquipmentRow, "id" | "weightKg"> | undefined,
  plates: readonly LoadPlate[],
): string {
  return [
    bar ? `${bar.id}:${bar.weightKg}` : "-",
    ...plates.map((plate) => `${plate.id}:${plate.weightKg}:${plate.count ?? "*"}`),
  ].join("|");
}

/**
 * Whether to put the default kit into an empty local inventory: only once the first sync has
 * finished (the account's own kit may be on its way), the inventory has loaded empty, and not
 * yet for this write scope. Seeding earlier duplicates the kit the sync then delivers.
 */
export function canSeedEquipment(input: {
  hasSynced: boolean;
  scope: string | null;
  loaded: boolean;
  rowCount: number;
  alreadySeeded: boolean;
}): boolean {
  return (
    input.hasSynced &&
    input.scope !== null &&
    input.scope !== "" &&
    input.loaded &&
    input.rowCount === 0 &&
    !input.alreadySeeded
  );
}

const sameItem = (row: EquipmentRow, item: GymEquipmentInput) =>
  row.kind === item.kind &&
  row.unit === item.unit &&
  Math.abs(row.weightKg - item.weight_kg) < SAME &&
  (item.kind === "plate" || (row.label ?? "").trim() === (item.label ?? "").trim());

/** The default kit of a unit without what the inventory already holds (enabled or not). */
export function missingKitItems(
  rows: readonly EquipmentRow[],
  unit: WeightUnit,
): GymEquipmentInput[] {
  return defaultGymKit(unit).filter((item) => !rows.some((row) => sameItem(row, item)));
}

export type KitGroup = { unit: WeightUnit; bars: EquipmentRow[]; plates: EquipmentRow[] };

/** Rows grouped by the unit they belong to; the preferred unit first and always present. */
export function kitGroups(rows: readonly EquipmentRow[], preferred: WeightUnit): KitGroup[] {
  const other: WeightUnit = preferred === "kg" ? "lb" : "kg";
  const group = (unit: WeightUnit): KitGroup => ({
    unit,
    bars: rows.filter((row) => row.unit === unit && row.kind === "bar"),
    plates: rows.filter((row) => row.unit === unit && row.kind === "plate"),
  });
  const second = group(other);
  return [group(preferred), ...(second.bars.length + second.plates.length > 0 ? [second] : [])];
}
