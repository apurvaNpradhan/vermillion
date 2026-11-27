/**
 * What a set row's effort cell shows. A logged effort always shows. The target (ghost) shows only on
 * the next set to log, with a dash when there is none; every other unlogged row stays empty, so the
 * column does not repeat the same number down the grid. The cell is tappable in all cases.
 */
export type EffortCell =
  | { kind: "logged"; value: number }
  | { kind: "ghost"; value: number }
  | { kind: "dash" }
  | { kind: "empty" };

export function effortCellOf({
  logged,
  ghost,
  current,
}: {
  logged: number | null;
  ghost: number | null;
  /** This is the next set to log. */
  current: boolean;
}): EffortCell {
  if (logged !== null) return { kind: "logged", value: logged };
  if (!current) return { kind: "empty" };
  return ghost === null ? { kind: "dash" } : { kind: "ghost", value: ghost };
}
