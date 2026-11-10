import { inSessionOrder, type LoggedSet, type SessionHistory } from "./logged-set";
import type { SetKind } from "./vocabulary";

/**
 * Previous: the ticked set of the latest finished Session that has the same kind and the same
 * place among that kind's sets (`ordinal`, 0-based: warm-up 1 to warm-up 1, working set 2 to
 * working set 2). `history` holds the Sessions that contain the exercise, from any Workout; a
 * finished Session without a ticked set of it is skipped. Null when nothing matches.
 */
export function previousFor(
  history: readonly SessionHistory[],
  kind: SetKind,
  ordinal: number,
): LoggedSet | null {
  const finished = inSessionOrder(history.filter((session) => session.finished_at !== null));
  for (let index = finished.length - 1; index >= 0; index -= 1) {
    const ticked = finished[index]?.sets.filter((set) => set.completed_at !== null) ?? [];
    if (ticked.length === 0) continue;
    return ticked.filter((set) => set.kind === kind)[ordinal] ?? null;
  }
  return null;
}
