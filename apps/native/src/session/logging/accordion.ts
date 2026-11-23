import { firstUnfinished, type Block, type BlockExercise } from "./blocks";

export const memberIds = (block: Block<BlockExercise>) => block.members.map((member) => member.id);

/** The set plus `ids`; the same set when they are all in already. */
export function expandedWith(
  expanded: ReadonlySet<string>,
  ids: readonly string[],
): ReadonlySet<string> {
  if (ids.every((id) => expanded.has(id))) return expanded;
  return new Set([...expanded, ...ids]);
}

/** The set without `ids`; the same set when none of them was in it. */
export function expandedWithout(
  expanded: ReadonlySet<string>,
  ids: readonly string[],
): ReadonlySet<string> {
  if (!ids.some((id) => expanded.has(id))) return expanded;
  return new Set([...expanded].filter((id) => !ids.includes(id)));
}

/** A Session opens on its first block with an unticked set. */
export function initialExpanded(blocks: readonly Block<BlockExercise>[]): ReadonlySet<string> {
  const first = firstUnfinished(blocks);
  return new Set(first ? memberIds(first) : []);
}

/** Keep surviving rows open, open new rows, and bring newly formed blocks into agreement. */
export function reconcileExpanded(
  before: readonly Block<BlockExercise>[],
  after: readonly Block<BlockExercise>[],
  expanded: ReadonlySet<string>,
): ReadonlySet<string> {
  const known = new Set(before.flatMap(memberIds));
  const next = new Set<string>();
  for (const block of after) {
    if (block.members.some(({ id }) => expanded.has(id) || !known.has(id))) {
      for (const { id } of block.members) next.add(id);
    }
  }
  return next.size === expanded.size && [...next].every((id) => expanded.has(id)) ? expanded : next;
}
