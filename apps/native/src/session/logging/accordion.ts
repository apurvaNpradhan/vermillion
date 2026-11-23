import { isBlockDone, nextAfter, firstUnfinished, type Block, type BlockExercise } from "./blocks";

/** The exercises that are open (by Session exercise id), and the one to scroll to after a change. */
export type Accordion = {
  expanded: ReadonlySet<string>;
  /** The exercise that was opened for the user (the next one to do); null when none was. */
  reveal: string | null;
};

const idsOf = (blocks: readonly Block<BlockExercise>[]) =>
  new Set(blocks.flatMap((block) => block.members.map((member) => member.id)));

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

/** Flips one exercise. */
export function toggled(expanded: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return expanded.has(id) ? expandedWithout(expanded, [id]) : expandedWith(expanded, [id]);
}

/**
 * What is open when a Session opens: the first block with an unticked set, all of its exercises
 * (a superset opens as one). A Session with nothing left to do opens collapsed.
 */
export function initialExpanded<E extends BlockExercise>(
  blocks: readonly Block<E>[],
): ReadonlySet<string> {
  const first = firstUnfinished(blocks);
  return new Set(first ? first.members.map((member) => member.id) : []);
}

/**
 * Brings the open set up to date after the Session changed:
 *  - exercises that are gone are dropped from it, and exercises that are new are opened;
 *  - a block that has just become done (every set of every member ticked) closes, and the next
 *    unfinished block after it (else the first unfinished before it) opens and is revealed.
 * A block that was already done, or is done only because it was new, does not move the accordion.
 * Returns the same `expanded` when nothing changed.
 */
export function afterChange<E extends BlockExercise>(
  before: readonly Block<E>[],
  after: readonly Block<E>[],
  expanded: ReadonlySet<string>,
): Accordion {
  const known = idsOf(before);
  const present = idsOf(after);
  let next = expanded;
  const gone = [...expanded].filter((id) => !present.has(id));
  next = expandedWithout(next, gone);
  const added = [...present].filter((id) => !known.has(id));
  next = expandedWith(next, added);

  let reveal: string | null = null;
  const previous = new Map(before.map((block) => [block.id, block] as const));
  for (const block of after) {
    const was = previous.get(block.id);
    if (!was || isBlockDone(was) || !isBlockDone(block)) continue;
    next = expandedWithout(
      next,
      block.members.map((member) => member.id),
    );
    const target = nextAfter(after, block.id);
    if (target) {
      next = expandedWith(
        next,
        target.members.map((member) => member.id),
      );
      reveal = target.members[0]?.id ?? null;
    }
  }
  return { expanded: next, reveal };
}

/** Where the keypad opens a cell of `exerciseId`: that exercise must be open for its row to exist. */
export function expandedForCell(
  expanded: ReadonlySet<string>,
  exerciseId: string | undefined,
): ReadonlySet<string> {
  return exerciseId === undefined ? expanded : expandedWith(expanded, [exerciseId]);
}
