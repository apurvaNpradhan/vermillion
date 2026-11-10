import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import { POSITION_REBALANCE_LENGTH } from "@workspace/shared";

/** Something in an ordered list: a Workout exercise or a Slot. */
export type Positioned = { id: string; position: string };

/** Plain code-unit order (what the keys are designed for), not locale collation. */
const compareKeys = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The list order: by key, then id, so two rows given the same key by two devices stay stable. */
export function byPosition(a: Positioned, b: Positioned): number {
  return compareKeys(a.position, b.position) || compareKeys(a.id, b.id);
}

export function sortByPosition<T extends Positioned>(items: readonly T[]): T[] {
  // A copy then `sort`: Hermes on the device has no `toSorted`.
  return [...items].sort(byPosition);
}

/** A key between two neighbours; `null` is the start or the end of the list. */
export function keyBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** The key for a new item appended to the list. */
export function keyAfterLast(items: readonly Positioned[]): string {
  return keyBetween(sortByPosition(items).at(-1)?.position ?? null, null);
}

/** `count` keys in order, appended after the list. */
export function keysAfterLast(items: readonly Positioned[], count: number): string[] {
  return generateNKeysBetween(sortByPosition(items).at(-1)?.position ?? null, null, count);
}

/**
 * The key for moving an item to just before `beforeId` (`null` = the end). The item itself is
 * ignored, so moving to where it already is gives a key still between the same neighbours.
 */
export function keyForMove(
  items: readonly Positioned[],
  movingId: string,
  beforeId: string | null,
): string {
  const rest = sortByPosition(items).filter((item) => item.id !== movingId);
  if (beforeId === null) return keyBetween(rest.at(-1)?.position ?? null, null);
  const index = rest.findIndex((item) => item.id === beforeId);
  if (index === -1) throw new Error("The item to move before is not in the list");
  const after = rest[index];
  const before = rest[index - 1];
  if (!after) throw new Error("The item to move before is not in the list");
  // Two rows can share a key after concurrent inserts; callers rebalance such a list first.
  if (before && before.position === after.position) throw new Error("Neighbours share a key");
  return keyBetween(before?.position ?? null, after.position);
}

/**
 * Whether the list is worth renumbering: a key has grown past the rebalance length, or two rows
 * share a key (two devices inserted at the same spot, so no key fits between them).
 */
export function needsRebalance(items: readonly Positioned[]): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    if (item.position.length > POSITION_REBALANCE_LENGTH || seen.has(item.position)) return true;
    seen.add(item.position);
  }
  return false;
}

/** Fresh short keys for the list in its current order: `[id, key]` for every item that changes. */
export function rebalanced(items: readonly Positioned[]): { id: string; position: string }[] {
  const ordered = sortByPosition(items);
  const keys = generateNKeysBetween(null, null, ordered.length);
  return ordered.flatMap((item, index) => {
    const position = keys[index];
    return position !== undefined && position !== item.position ? [{ id: item.id, position }] : [];
  });
}
