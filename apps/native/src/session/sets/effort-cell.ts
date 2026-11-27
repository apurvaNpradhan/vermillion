/**
 * Show the recorded effort on completed sets, and the entered effort or target on the next set.
 * The other cells stay empty but can still be edited.
 */
type EffortCell =
  | { kind: "logged"; value: number }
  | { kind: "target"; value: number }
  | { kind: "dash" }
  | { kind: "empty" };

export function effortCellOf({
  logged,
  target,
  ticked,
  current,
}: {
  logged: number | null;
  target: number | null;
  ticked: boolean;
  current: boolean;
}): EffortCell {
  if ((ticked || current) && logged !== null) return { kind: "logged", value: logged };
  if (ticked || !current) return { kind: "empty" };
  return target === null ? { kind: "dash" } : { kind: "target", value: target };
}
