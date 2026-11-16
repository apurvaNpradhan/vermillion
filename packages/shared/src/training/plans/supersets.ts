/**
 * Supersets (ADR 0036): consecutive exercises of a Workout that share a `superset_group`. Order
 * is the fractional position, so after concurrent reorders a group's members may no longer be
 * consecutive. Every consecutive run of one group is then treated as its own group, and a group
 * of one is no group at all. Rest is held once per group, on its last member; the others are null.
 */

/** A consecutive stretch of two or more exercises of one group, in order. */
export type SupersetRun<T> = { start: number; items: T[] };

/**
 * The runs of `items` (already in position order). Rows without a group, rows whose group is not
 * shared with a neighbour, and gaps all break a run. Members of one group that are no longer
 * consecutive form separate runs.
 */
export function supersetRuns<T>(
  items: readonly T[],
  groupOf: (item: T) => string | null,
): SupersetRun<T>[] {
  const runs: SupersetRun<T>[] = [];
  let current: SupersetRun<T> | null = null;
  let currentGroup: string | null = null;
  const flush = () => {
    if (current && current.items.length >= 2) runs.push(current);
    current = null;
    currentGroup = null;
  };
  for (const [index, item] of items.entries()) {
    const group = groupOf(item);
    if (group === null) {
      flush();
    } else if (current && currentGroup === group) {
      current.items.push(item);
    } else {
      flush();
      current = { start: index, items: [item] };
      currentGroup = group;
    }
  }
  flush();
  return runs;
}

/** Where a row sits in its run: `none` when it is not in a superset. */
export type SupersetPlace = "none" | "first" | "middle" | "last";

/** The place of each item in {@link supersetRuns}, by index. */
export function supersetPlaces<T>(
  items: readonly T[],
  groupOf: (item: T) => string | null,
): SupersetPlace[] {
  const places = items.map((): SupersetPlace => "none");
  for (const run of supersetRuns(items, groupOf)) {
    run.items.forEach((_, offset) => {
      places[run.start + offset] =
        offset === 0 ? "first" : offset === run.items.length - 1 ? "last" : "middle";
    });
  }
  return places;
}

/** What the planners need of a Workout exercise. */
export type SupersetItem = {
  id: string;
  superset_group: string | null;
  rest_seconds: number | null;
};

/** A field change a planner asks for; absent fields stay. */
export type SupersetChange = {
  id: string;
  superset_group?: string | null;
  rest_seconds?: number | null;
};

const groupOfItem = (item: SupersetItem) => item.superset_group;

/** The group's rest of each run before a change: the rest of its last member. */
function groupRests(rows: readonly SupersetItem[]) {
  return supersetRuns(rows, groupOfItem).map((run) => ({
    ids: run.items.map((item) => item.id),
    rest: run.items.at(-1)?.rest_seconds ?? null,
  }));
}

/** Clears groups of one and nulls the rest of every member that is not last in its run. */
function repaired(rows: readonly SupersetItem[]): SupersetItem[] {
  const runs = supersetRuns(rows, groupOfItem);
  const inRun = new Set(runs.flatMap((run) => run.items.map((item) => item.id)));
  const nonLast = new Set(runs.flatMap((run) => run.items.slice(0, -1).map((item) => item.id)));
  return rows.map((row) => ({
    ...row,
    superset_group: inRun.has(row.id) ? row.superset_group : null,
    rest_seconds: nonLast.has(row.id) ? null : row.rest_seconds,
  }));
}

/**
 * After members left, moved or were removed: whoever now stands alone, or ends a run, with no
 * rest takes the rest its old group had, so leaving a superset never silently turns rest off.
 */
function settled(
  rows: readonly SupersetItem[],
  old: readonly { ids: string[]; rest: number | null }[],
): SupersetItem[] {
  const last = new Set(
    supersetRuns(rows, groupOfItem).flatMap((run) => run.items.slice(-1).map((item) => item.id)),
  );
  const inRun = new Set(
    supersetRuns(rows, groupOfItem).flatMap((run) => run.items.map((item) => item.id)),
  );
  const restOf = new Map(old.flatMap((group) => group.ids.map((id) => [id, group.rest] as const)));
  return rows.map((row) => {
    const inherited = restOf.get(row.id) ?? null;
    const needs = !inRun.has(row.id) || last.has(row.id);
    return row.rest_seconds === null && inherited !== null && needs
      ? { ...row, rest_seconds: inherited }
      : row;
  });
}

function diff(base: readonly SupersetItem[], next: readonly SupersetItem[]): SupersetChange[] {
  const before = new Map(base.map((row) => [row.id, row]));
  const changes: SupersetChange[] = [];
  for (const row of next) {
    const old = before.get(row.id);
    if (!old) continue;
    const change: SupersetChange = { id: row.id };
    if (old.superset_group !== row.superset_group) change.superset_group = row.superset_group;
    if (old.rest_seconds !== row.rest_seconds) change.rest_seconds = row.rest_seconds;
    if (Object.keys(change).length > 1) changes.push(change);
  }
  return changes;
}

/**
 * "Superset with next": the row and the one after it share a group, joining the next row's group
 * when it has one (then the whole run of the row joins it). Rest stays on the last member and the
 * others become null. Empty when there is no next row or they are already together.
 */
export function planSupersetWithNext(
  rows: readonly SupersetItem[],
  id: string,
  newGroup: string,
): SupersetChange[] {
  const index = rows.findIndex((row) => row.id === id);
  const here = rows[index];
  const next = rows[index + 1];
  if (!here || !next) return [];
  const runs = supersetRuns(rows, groupOfItem);
  const runOf = (row: SupersetItem) =>
    runs.find((run) => run.items.some((item) => item.id === row.id))?.items ?? [row];
  const together = runOf(here).some((item) => item.id === next.id);
  if (together) return [];
  const target = next.superset_group ?? here.superset_group ?? newGroup;
  const members = new Set([...runOf(here), ...runOf(next)].map((item) => item.id));
  const working = rows.map((row) =>
    members.has(row.id) ? { ...row, superset_group: target } : row,
  );
  return diff(rows, repaired(working));
}

/**
 * "Remove from superset": the row leaves its group. A group left with one member is cleared; a
 * member left alone, or the new last of its group, takes the group's rest when it has none.
 */
export function planLeaveSuperset(rows: readonly SupersetItem[], id: string): SupersetChange[] {
  const old = groupRests(rows);
  const working = rows.map((row) => (row.id === id ? { ...row, superset_group: null } : row));
  return diff(rows, settled(repaired(working), old));
}

/**
 * After a move (`after` holds the new order, `before` the old): a member that is no longer next
 * to a member of its group leaves it; a row dropped between two members of one group joins it.
 */
export function planSupersetAfterMove(
  before: readonly SupersetItem[],
  after: readonly SupersetItem[],
  id: string,
): SupersetChange[] {
  const index = after.findIndex((row) => row.id === id);
  const moved = after[index];
  if (!moved) return [];
  const previous = after[index - 1]?.superset_group ?? null;
  const next = after[index + 1]?.superset_group ?? null;
  let group = moved.superset_group;
  if (previous !== null && previous === next) group = previous;
  else if (group !== null && previous !== group && next !== group) group = null;
  const old = groupRests(before);
  const working = after.map((row) => (row.id === id ? { ...row, superset_group: group } : row));
  return diff(after, settled(repaired(working), old));
}

/** After a row was removed: `rows` is the order before it went. Changes for the others only. */
export function planSupersetAfterRemoval(
  rows: readonly SupersetItem[],
  id: string,
): SupersetChange[] {
  const old = groupRests(rows);
  const remaining = rows.filter((row) => row.id !== id);
  return diff(remaining, settled(repaired(remaining), old));
}

/** Clears groups of one and nulls non-last rests; the invariant after any write. */
export function planSupersetRepair(rows: readonly SupersetItem[]): SupersetChange[] {
  return diff(rows, repaired(rows));
}
