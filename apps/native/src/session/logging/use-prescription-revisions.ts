import { staleSets, type PrescriptionDraft } from "@workspace/shared";
import { useEffect, useRef } from "react";

import { freshPrescription } from "@/session/store/derive";
import type { SessionState, SessionStore } from "@/session/store/session-store";

import { currentSetsOf } from "./logging-ghosts";

/**
 * Keeps the Session's snapshots in step with the exercises they were made for. The snapshot holds
 * numbers the lifter saw, so it does not follow history, but three edits do change what a set
 * should be offered: the Session gym moved (every unticked set is suggested again), a set's
 * target or kind was edited (that set is), and a set was added after the snapshot (it gets a
 * suggestion appended). Ticked sets and adjustments the lifter has not outgrown stay. Only the
 * device that runs the Session writes, and each situation is tried once.
 */
export function usePrescriptionRevisions({
  store,
  views,
  readOnly,
  ready,
  revise,
}: {
  store: SessionStore;
  /** Changes whenever anything an exercise draws or suggests changes. */
  views: SessionState["views"];
  readOnly: boolean;
  /** History and the snapshots are loaded: a suggestion made now would be a real one. */
  ready: boolean;
  revise: (id: string, draft: PrescriptionDraft, replace: readonly string[]) => Promise<boolean>;
}) {
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (readOnly || !ready) return;
    const state = store.getState();
    if (state.session.finishedAt !== null) return;
    for (const [id, entry] of state.cache) {
      const snapshot = entry.exercise.prescription;
      if (!snapshot || entry.finished) continue;
      const gymId = entry.inputs.sessionGymId ?? null;
      const current = currentSetsOf(entry.exercise);
      const stale = staleSets(snapshot, current, gymId);
      if (!stale) continue;
      const key = JSON.stringify([id, snapshot.revision, gymId, current]);
      if (tried.current.has(key)) continue;
      const draft = freshPrescription(entry);
      // No suggestion yet (history is still coming): look again at the next change.
      if (!draft) continue;
      tried.current.add(key);
      void revise(id, draft, [...stale]).catch(() => undefined);
    }
  }, [store, views, readOnly, ready, revise]);
}
