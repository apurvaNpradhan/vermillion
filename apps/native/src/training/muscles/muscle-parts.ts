import type { DetailLoad, DetailPart, MuscleGroup } from "@workspace/shared";

/**
 * The parts shown under a group's row ("Front delts 9 · Side delts 3"): none for a group whose
 * sets name no detail (a breakdown of "unspecified" alone says nothing), otherwise every part in
 * the order given. `weeks` turns a total into a weekly average. Parts are never zero.
 */
export function groupParts(
  loads: readonly DetailLoad[],
  muscle: MuscleGroup,
  weeks = 1,
): DetailPart[] {
  const parts = loads.find((load) => load.muscle === muscle)?.parts ?? [];
  if (!parts.some((part) => part.detail !== "unspecified")) return [];
  return parts.map((part) => ({ detail: part.detail, sets: part.sets / weeks }));
}
