import { recordFlags, type LoggedSet, type SessionHistory } from "@workspace/shared";

/**
 * Whether the set just ticked is a Record: it beats every set of that exercise in the finished
 * Sessions before this one. `history` is the exercise's finished Sessions (what Previous reads);
 * `sets` are this Session's sets of the exercise as they are after the tick. A first-ever
 * Session of an exercise has nothing to beat, so it is never a Record. Warm-ups never are.
 */
export function tickedSetIsRecord(input: {
  history: readonly SessionHistory[];
  session: { id: string; startedAt: string };
  sets: readonly LoggedSet[];
  setId: string;
  bodyweightKg: number | null;
}): boolean {
  const current: SessionHistory = {
    id: input.session.id,
    started_at: input.session.startedAt,
    finished_at: null,
    sets: input.sets,
  };
  return recordFlags([...input.history, current], input.bodyweightKg).has(input.setId);
}
