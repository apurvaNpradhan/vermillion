import { supersetRuns } from "@workspace/shared";

/** What the accordion needs of a Session exercise. */
export type BlockExercise = {
  id: string;
  supersetGroup: string | null;
  sets: readonly { id: string; completedAt: string | null }[];
};

/** One accordion unit: a lone exercise, or a superset run that opens and closes as one. */
export type Block<E extends BlockExercise> = {
  /** The id of its first exercise; stable while the block's first member stays. */
  id: string;
  members: E[];
  superset: boolean;
};

/**
 * The exercises of a Session, in order, as accordion blocks. Consecutive exercises of one
 * superset group form a block; a group of one is no group (`supersetRuns` already drops it).
 */
export function blocksOf<E extends BlockExercise>(exercises: readonly E[]): Block<E>[] {
  const runs = new Map(
    supersetRuns(exercises, (item) => item.supersetGroup).map((run) => [run.start, run]),
  );
  const blocks: Block<E>[] = [];
  let index = 0;
  while (index < exercises.length) {
    const run = runs.get(index);
    if (run) {
      blocks.push({ id: run.items[0]?.id ?? "", members: run.items, superset: true });
      index += run.items.length;
    } else {
      const only = exercises[index];
      if (only) blocks.push({ id: only.id, members: [only], superset: false });
      index += 1;
    }
  }
  return blocks;
}

/** The block that holds an exercise, or undefined. */
export function blockOf<E extends BlockExercise>(
  blocks: readonly Block<E>[],
  exerciseId: string,
): Block<E> | undefined {
  return blocks.find((block) => block.members.some((member) => member.id === exerciseId));
}

const ticked = (exercise: BlockExercise) =>
  exercise.sets.filter((set) => set.completedAt !== null).length;

/** Every set of every member is ticked. A block whose exercises have no sets is done. */
export function isBlockDone(block: Block<BlockExercise>): boolean {
  return block.members.every((member) => ticked(member) === member.sets.length);
}

/** The first block with an unticked set, or null when everything is done. */
export function firstUnfinished<E extends BlockExercise>(
  blocks: readonly Block<E>[],
): Block<E> | null {
  return blocks.find((block) => !isBlockDone(block)) ?? null;
}

/**
 * Where the accordion goes when `finishedId`'s block is complete: the next unfinished block after
 * it, else the first unfinished one before it, else null (the session is complete: nothing opens).
 */
export function nextAfter<E extends BlockExercise>(
  blocks: readonly Block<E>[],
  finishedId: string,
): Block<E> | null {
  const at = blocks.findIndex((block) => block.members.some((member) => member.id === finishedId));
  const after = blocks.slice(at + 1).find((block) => !isBlockDone(block));
  return after ?? blocks.slice(0, Math.max(at, 0)).find((block) => !isBlockDone(block)) ?? null;
}

/** The set the highlight sits on: an exercise and one of its sets. */
export type Highlight = { exerciseId: string; setId: string };

/**
 * The set to log next in a block. A lone exercise: its first unticked set. A superset goes by
 * rounds (A1, B1, A2, B2 …): the first unticked set of the earliest round, in member order, so
 * ticking a member's set moves the highlight to the next member's matching set. A member with
 * fewer sets simply sits out the later rounds.
 */
export function highlightOf(block: Block<BlockExercise>): Highlight | null {
  const rounds = Math.max(0, ...block.members.map((member) => member.sets.length));
  for (let round = 0; round < rounds; round += 1) {
    for (const member of block.members) {
      const set = member.sets[round];
      if (set && set.completedAt === null) return { exerciseId: member.id, setId: set.id };
    }
  }
  return null;
}
