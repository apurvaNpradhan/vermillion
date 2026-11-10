import { toggleSelection, withSelected, type PickOptions } from "./pick-selection";

/** One open picker: what was asked, what is selected, and how to answer the caller. */
export type PickSession = {
  readonly id: string;
  readonly options: PickOptions;
  readonly selected: readonly string[];
};

type Entry = {
  session: PickSession;
  settle: (ids: string[] | null) => void;
};

/**
 * Open pickers by request id. A route cannot carry a callback in its params, so the route carries
 * only the request id and the session lives here, outside React; the caller awaits the promise.
 */
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  for (const listener of listeners) listener();
}

function update(id: string, change: (session: PickSession) => PickSession) {
  const entry = entries.get(id);
  if (!entry) return;
  entry.session = change(entry.session);
  emit();
}

/** A newly opened session: its request id and the caller's promise. */
export type OpenedPick = { id: string; result: Promise<string[] | null> };

/** Opens a session. The promise resolves with the ordered ids, or `null` when dismissed. */
export function openPickSession(options: PickOptions): OpenedPick {
  counter += 1;
  const id = `pick-${counter}`;
  const result = new Promise<string[] | null>((settle) => {
    entries.set(id, { session: { id, options, selected: [] }, settle });
  });
  emit();
  return { id, result };
}

/**
 * Whether a picker is open and unanswered. The picker is a full-screen sheet, so a second one is
 * never wanted: a row inside a bottom sheet can fire its press twice on Android, which would stack
 * two pickers.
 */
export function hasOpenPickSession(): boolean {
  return entries.size > 0;
}

export function getPickSession(id: string): PickSession | null {
  return entries.get(id)?.session ?? null;
}

export function subscribePickSessions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function togglePick(id: string, exerciseId: string) {
  update(id, (session) => ({
    ...session,
    selected: toggleSelection(session.selected, exerciseId, session.options),
  }));
}

/** Selects an exercise created from inside the picker. */
export function selectCreated(id: string, exerciseId: string) {
  update(id, (session) => ({
    ...session,
    selected: withSelected(session.selected, exerciseId, session.options),
  }));
}

export function clearPick(id: string) {
  update(id, (session) => ({ ...session, selected: [] }));
}

/**
 * Answers the caller with the selection and closes the session. `unavailable` lists ids that
 * became archived (say, on another device) while the picker was open; they are left out, and the
 * order of the rest is kept.
 */
export function finishPick(id: string, unavailable: ReadonlySet<string> = new Set()) {
  const entry = entries.get(id);
  if (!entry) return;
  entries.delete(id);
  entry.settle(entry.session.selected.filter((picked) => !unavailable.has(picked)));
  emit();
}

/** Answers the caller with `null` (dismissed, or the account was reset) and closes the session. */
export function cancelPick(id: string) {
  const entry = entries.get(id);
  if (!entry) return;
  entries.delete(id);
  entry.settle(null);
  emit();
}
