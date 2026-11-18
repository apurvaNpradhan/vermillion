import { supersetRuns, type SetKind } from "@workspace/shared";

/** What the accordion needs of a Session exercise. */
export type BlockExercise = {
  id: string;
  supersetGroup: string | null;
  sets: readonly { id: string; completedAt: string | null; kind?: SetKind }[];
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

/** One set of a block in logging order, with its place among its exercise's sets (0-based). */
export type RoundSet<E extends BlockExercise> = {
  exercise: E;
  set: E["sets"][number];
  index: number;
};

/**
 * The block's sets as rounds, in the order they are logged: the one ordering the guided
 * logging, the set highlight, the Timer screen, the notification and the rest timer share.
 * A lone exercise is top to bottom, a set per round. A superset goes by rounds (A1, B1, A2,
 * B2 …) in member order, warm-up rounds first and then work rounds: a member's warm-ups pair
 * with other members' warm-ups, never with their work sets (A warm-up, A work + B work). A
 * member with fewer sets sits out the later rounds.
 */
export function roundsOf<E extends BlockExercise>(block: Block<E>): RoundSet<E>[][] {
  if (!block.superset) {
    return block.members.flatMap((exercise) =>
      exercise.sets.map((set, index) => [{ exercise, set, index }]),
    );
  }
  const rounds: RoundSet<E>[][] = [];
  for (const warmup of [true, false]) {
    const lists = block.members.map((exercise) =>
      exercise.sets.flatMap((set, index) =>
        (set.kind === "warmup") === warmup ? [{ exercise, set, index }] : [],
      ),
    );
    const count = Math.max(0, ...lists.map((list) => list.length));
    for (let round = 0; round < count; round += 1) {
      rounds.push(lists.flatMap((list) => list[round] ?? []));
    }
  }
  return rounds;
}

/**
 * The set to log next in a block: the first unticked set in logging order (`roundsOf`). A lone
 * exercise: its first unticked set. In a superset, ticking a member's set moves the highlight to
 * the next member's matching set.
 */
export function highlightOf(block: Block<BlockExercise>): Highlight | null {
  for (const round of roundsOf(block)) {
    for (const { exercise, set } of round) {
      if (set.completedAt === null) return { exerciseId: exercise.id, setId: set.id };
    }
  }
  return null;
}
