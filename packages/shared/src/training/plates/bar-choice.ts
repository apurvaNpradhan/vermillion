import type { Equipment } from "../../exercise/vocabulary";
import { KG_PER_LB } from "../vocabulary/format";
import type { WeightUnit } from "../vocabulary/vocabulary";
import { EZ_BAR_LABEL, TRAP_BAR_LABEL } from "./gym-kit";
import type { LoadPlate } from "./plates";

/** What choosing a bar needs of a row of a gym's kit. */
export type KitRow = {
  id: string;
  kind: "bar" | "plate";
  weightKg: number;
  unit: WeightUnit;
  label: string | null;
  count: number | null;
  enabled: boolean;
};

/** Kilograms of difference below which two weights are the same load. */
const SAME = 0.0005;

const STANDARD_BAR_KG = { kg: 20, lb: 45 * KG_PER_LB } as const satisfies Record<
  WeightUnit,
  number
>;

/** The enabled bars, in the stored order. */
export function enabledBars<Row extends KitRow>(rows: readonly Row[]): Row[] {
  return rows.filter((row) => row.kind === "bar" && row.enabled);
}

/** With a unit override, use matching bars if the gym has any. */
export function barsInUnit<Row extends KitRow>(
  bars: readonly Row[],
  unit: WeightUnit,
): readonly Row[] {
  const matching = bars.filter((bar) => bar.unit === unit);
  return matching.length ? matching : bars;
}

/** The plates the solver may use for a bar: enabled, and in the bar's own unit. */
export function platesForBar(rows: readonly KitRow[], bar: Pick<KitRow, "unit">): LoadPlate[] {
  return rows.flatMap((row) =>
    row.kind === "plate" && row.enabled && row.unit === bar.unit
      ? [{ id: row.id, weightKg: row.weightKg, count: row.count }]
      : [],
  );
}

/** The bar label an EZ bar or trap bar exercise opens on; null for other equipment. */
function barLabelFor(equipment: Equipment | null | undefined): string | null {
  if (equipment === "ez_bar") return EZ_BAR_LABEL;
  if (equipment === "trap_bar") return TRAP_BAR_LABEL;
  return null;
}

const sameLabel = (a: string | null, b: string) =>
  (a ?? "").trim().toLowerCase() === b.toLowerCase();

/** The enabled bar labelled for the equipment (case-insensitive), the preferred unit's first. */
function labelledBar<Row extends KitRow>(
  bars: readonly Row[],
  equipment: Equipment | null | undefined,
  preferred: WeightUnit,
): Row | undefined {
  const label = barLabelFor(equipment);
  if (label === null) return undefined;
  const found = bars.filter((bar) => sameLabel(bar.label, label));
  return found.find((bar) => bar.unit === preferred) ?? found[0];
}

/**
 * The label an EZ bar or trap bar exercise needs when no enabled bar carries it, so the sheet can
 * point at Manage equipment; null when the bar exists or the equipment needs none.
 */
export function missingBarLabel(
  bars: readonly KitRow[],
  equipment: Equipment | null | undefined,
): string | null {
  const label = barLabelFor(equipment);
  return label !== null && !bars.some((bar) => sameLabel(bar.label, label)) ? label : null;
}

/**
 * The bar an exercise loads with in a gym: the one it remembers if it is among `bars` (the
 * enabled bars of that gym, so a bar remembered from another gym is not); for an EZ bar or trap
 * bar exercise the enabled bar labelled "EZ" or "Trap"; else the standard bar of the preferred
 * unit (20 kg, 45 lb), else the first bar of that unit, else the first bar.
 */
export function defaultBar<Row extends KitRow>(
  bars: readonly Row[],
  rememberedId: string | null | undefined,
  preferred: WeightUnit,
  equipment?: Equipment | null,
  preferMatchingUnit = false,
): Row | undefined {
  if (preferMatchingUnit) bars = barsInUnit(bars, preferred);
  const remembered = rememberedId ? bars.find((bar) => bar.id === rememberedId) : undefined;
  if (remembered) return remembered;
  const labelled = labelledBar(bars, equipment, preferred);
  if (labelled) return labelled;
  const inUnit = bars.filter((bar) => bar.unit === preferred);
  return (
    inUnit.find((bar) => Math.abs(bar.weightKg - STANDARD_BAR_KG[preferred]) < SAME) ??
    inUnit[0] ??
    bars[0]
  );
}
