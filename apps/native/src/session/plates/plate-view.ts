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

/**
 * The plates of one side in build mode, heaviest nearest the collar. A stack is a plain list of
 * the plates added, one entry per plate on that side; the bar carries a matching pair.
 */
export type PlateStack = readonly LoadPlate[];

/** Adds one plate to a side, keeping the heaviest first and a repeated weight after its twins. */
export function addToStack(stack: PlateStack, plate: LoadPlate): LoadPlate[] {
  const at = stack.findIndex((item) => item.weightKg < plate.weightKg - SAME);
  const next = [...stack];
  next.splice(at === -1 ? next.length : at, 0, plate);
  return next;
}

/** Removes the plate drawn at `index`; an index outside the stack changes nothing. */
export function removeFromStack(stack: PlateStack, index: number): LoadPlate[] {
  return stack.filter((_, i) => i !== index);
}

/** Removes the outermost plate of one kind, the one a chip's minus takes off. */
export function removeKindFromStack(stack: PlateStack, plateId: string): LoadPlate[] {
  let at = stack.length - 1;
  while (at >= 0 && stack[at]?.id !== plateId) at -= 1;
  return at === -1 ? [...stack] : removeFromStack(stack, at);
}

/** An empty bar. */
export function clearStack(): LoadPlate[] {
  return [];
}

/** How many plates of one kind a side holds. */
export function stackCount(stack: PlateStack, plateId: string): number {
  return stack.filter((item) => item.id === plateId).length;
}

/** The weight of one side's plates. */
export function stackSideKg(stack: PlateStack): number {
  return stack.reduce((sum, item) => sum + item.weightKg, 0);
}

/** The loaded bar: its own weight plus a matching stack on both sides. */
export function stackTotalKg(barKg: number, stack: PlateStack): number {
  return barKg + 2 * stackSideKg(stack);
}

/**
 * The plate kinds the stack uses on more pairs than the inventory holds. A kind with no count is
 * unlimited, and a plate that is not in the inventory at all counts as having none.
 */
export function overInventory(stack: PlateStack, inventory: readonly LoadPlate[]): string[] {
  const ids = new Set(stack.map((item) => item.id));
  return ids
    .values()
    .filter((id) => {
      const have = inventory.find((item) => item.id === id);
      return stackCount(stack, id) > (have ? (have.count ?? Infinity) : 0);
    })
    .toArray();
}

const SHAFT = 40;
const COLLAR_WIDTH = 10;
const COLLAR_HEIGHT = 46;
const END_PAD = 14;
const PLATE_GAP = 2;
const LABEL_CHAR = 6.2;
/** Plates heavier than this are drawn at the largest size. */
const BIGGEST_KG = 25;

/** Drawn width of a plate: thicker for heavier plates, never a sliver. */
export function plateWidth(weightKg: number): number {
  return 9 + Math.min(weightKg, BIGGEST_KG) * 0.5;
}

/** Drawn height of a plate: grows with its weight, like the diameter of a real plate. */
export function plateHeight(weightKg: number): number {
  return 34 + Math.min(weightKg, BIGGEST_KG) * 3.4;
}

export type PlateSlot = { x: number; width: number; height: number; showLabel: boolean };
export type PlateLayout = {
  slots: PlateSlot[];
  /** Total drawing width and height, in the same units as the slots. */
  width: number;
  height: number;
  /** Where the collar starts (the shaft ends) and how tall it is. */
  collarX: number;
  collarWidth: number;
  collarHeight: number;
};

/**
 * Where each plate of one side is drawn: the bar's shaft, then the collar, then the plates from
 * the collar outwards (heaviest first), each against the last. Plate widths shrink together when
 * the stack would not fit `maxWidth`. A plate's label runs along its height, and is left out
 * only when the plate is too short to hold it.
 */
export function plateLayout(
  plates: readonly LoadPlate[],
  label: (weightKg: number) => string,
  maxWidth: number,
): PlateLayout {
  const natural = plates.reduce((sum, p) => sum + plateWidth(p.weightKg) + PLATE_GAP, 0);
  const fixed = SHAFT + COLLAR_WIDTH + END_PAD;
  const scale = natural === 0 ? 1 : Math.max(0, Math.min(1, (maxWidth - fixed) / natural));
  let x = SHAFT + COLLAR_WIDTH + PLATE_GAP;
  let height = COLLAR_HEIGHT;
  const slots = plates.map((plate) => {
    const width = plateWidth(plate.weightKg) * scale;
    const tall = plateHeight(plate.weightKg);
    const slot = {
      x,
      width,
      height: tall,
      showLabel: label(plate.weightKg).length * LABEL_CHAR <= tall - 6 && width >= 7,
    };
    x += width + PLATE_GAP * scale;
    height = Math.max(height, tall);
    return slot;
  });
  return {
    slots,
    width: x + END_PAD,
    height,
    collarX: SHAFT,
    collarWidth: COLLAR_WIDTH,
    collarHeight: COLLAR_HEIGHT,
  };
}

export type PlateRole = "red" | "blue" | "yellow" | "green" | "white" | "black";

/** The competition colour of a plate by its weight in the kit's unit (IWF kg; lb by analogy). */
export function plateRole(weightKg: number, unit: WeightUnit): PlateRole {
  // Rounded, so a converted 45 lb plate is not 44.999… lb.
  const weight = Math.round((unit === "lb" ? weightKg / KG_PER_LB : weightKg) * 100) / 100;
  if (weight >= (unit === "lb" ? 55 : 25)) return "red";
  if (weight >= (unit === "lb" ? 45 : 20)) return "blue";
  if (weight >= (unit === "lb" ? 35 : 15)) return "yellow";
  if (weight >= (unit === "lb" ? 25 : 10)) return "green";
  if (weight >= (unit === "lb" ? 10 : 5)) return "white";
  return "black";
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
