import { inSessionOrder, type LoggedSet, type SessionHistory } from "./logged-set";
import type { SetKind } from "../vocabulary/vocabulary";
import { isBaselinePhase } from "../phases/phases";

type Previous = ReadonlyMap<SetKind, readonly LoggedSet[]>;
const cached = new WeakMap<readonly SessionHistory[], { latest: Previous; baseline: Previous }>();

function previousByKind(history: readonly SessionHistory[]) {
  const existing = cached.get(history);
  if (existing) return existing;
  const finished = inSessionOrder(history.filter((session) => session.finished_at !== null));
  let latest: Previous | undefined;
  let baseline: Previous | undefined;
  for (let index = finished.length - 1; index >= 0; index -= 1) {
    const session = finished[index];
    if (!session) continue;
    const eligible = isBaselinePhase(session.phase);
    if (latest && !eligible) continue;
    const sets = new Map<SetKind, LoggedSet[]>();
    for (const set of session.sets) {
      if (set.completed_at === null) continue;
      const kind = sets.get(set.kind) ?? [];
      kind.push(set);
      sets.set(set.kind, kind);
    }
    if (sets.size === 0) continue;
    latest ??= sets;
    if (eligible) {
      baseline = sets;
      break;
    }
  }
  const result = { latest: latest ?? new Map(), baseline: baseline ?? new Map() };
  cached.set(history, result);
  return result;
}

/** Previous is the same kind and ordinal in the latest finished Session with any ticked sets. */
export function previousFor(
  history: readonly SessionHistory[],
  kind: SetKind,
  ordinal: number,
  baselineOnly = false,
): LoggedSet | null {
  const { latest, baseline } = previousByKind(history);
  return (baselineOnly ? baseline : latest).get(kind)?.[ordinal] ?? null;
}
