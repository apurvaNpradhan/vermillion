import {
  NOTES_PAGE_SIZE,
  createNote,
  deleteNote,
  updateNote,
  watchNote,
  watchNotes,
  type LocalNote,
  type NotePatch,
  type NotesDatabase,
  type NotesPage,
} from "@workspace/sync";
import { useToast } from "heroui-native";
import { useCallback, useEffect, useMemo, useState } from "react";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useLocalData, useSyncStatus } from "@/sync";

/** How long a deleted note can be brought back before it is really deleted. */
const UNDO_MS = 5000;

/**
 * The signed-in user's notes, read from and written to the local database (ADR 0016). Writes
 * return as soon as they are saved on the device and upload in the background. The list is
 * bounded: `loadMore` widens the window by one page.
 */
export function useNotes() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const local = useLocalData();
  const { snapshot } = useSyncStatus();
  const database = local?.status === "ready" ? local.database : null;
  const [limit, setLimit] = useState(NOTES_PAGE_SIZE);
  const [page, setPage] = useState<NotesPage | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!database) return;
    return watchNotes(database, limit, {
      onPage: (next) => {
        setLoadFailed(false);
        setPage(next);
      },
      onError: () => setLoadFailed(true),
    });
  }, [database, limit]);

  const write = useCallback(
    async (action: (db: NotesDatabase) => Promise<void | string | boolean>) => {
      try {
        if (!database) throw new Error("Local storage is not available");
        await action(database);
      } catch (error) {
        toast.show({ variant: "danger", label: t("errors__unknown") });
        throw error;
      }
    },
    [database, t, toast],
  );

  // Stable while the database is, so memoised rows are not re-rendered by a new callback.
  const loadMore = useCallback(() => setLimit((current) => current + NOTES_PAGE_SIZE), []);
  const create = useCallback(
    async (input: { title: string; body: string }) => {
      await write((db) => createNote(db, input));
    },
    [write],
  );
  /** Sends only the fields in the patch; pass the dirty fields of the form (`draftPatch`). */
  const update = useCallback(
    async (input: { id: string } & NotePatch) => {
      const { id, ...patch } = input;
      await write((db) => updateNote(db, id, patch));
    },
    [write],
  );
  const remove = useCallback(
    async (id: string) => {
      await write((db) => deleteNote(db, id));
    },
    [write],
  );

  // A delete waits for its toast to go: the row is hidden at once and only removed if the user
  // does not press Undo, so undoing never has to restore a deleted note.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const setHiddenId = useCallback((id: string, isHidden: boolean) => {
    setHidden((current) => {
      const next = new Set(current);
      if (isHidden) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const removeWithUndo = useCallback(
    (id: string) => {
      // Settles once: Undo, or the delete when the toast goes. A toast can report hiding more
      // than once (a swipe, then its timer), and the delete must not be queued twice.
      let settled = false;
      setHiddenId(id, true);
      haptic.confirm();
      toast.show({
        label: t("notes__deleted_toast"),
        actionLabel: t("common__undo"),
        duration: UNDO_MS,
        onActionPress: ({ hide }) => {
          if (settled) return;
          settled = true;
          setHiddenId(id, false);
          hide();
        },
        onHide: () => {
          if (settled) return;
          settled = true;
          remove(id)
            .catch(() => undefined)
            .finally(() => setHiddenId(id, false));
        },
      });
    },
    [remove, setHiddenId, t, toast],
  );
  const visible = useMemo(
    () => (page?.notes ?? []).filter((note) => !hidden.has(note.id)),
    [page, hidden],
  );

  return {
    notes: visible,
    isLoading: local === null || (database !== null && page === null && !loadFailed),
    /** A local read failed: not the same as "no notes". */
    loadFailed: loadFailed || local?.status === "unavailable",
    /** The first full sync has not finished, so an empty list may only mean "not downloaded yet". */
    isFirstSync:
      snapshot !== null &&
      !snapshot.hasSynced &&
      snapshot.indicator !== "paused" &&
      snapshot.lockReason === null,
    hasMore: page?.hasMore ?? false,
    loadMore,
    create,
    update,
    removeWithUndo,
  };
}

/**
 * One note, live: the row, `null` once it is gone, `undefined` before the first read. An open
 * edit form follows it so a change elsewhere reaches the form without overwriting the user's text.
 */
export function useLiveNote(id: string | null): LocalNote | null | undefined {
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const [note, setNote] = useState<LocalNote | null | undefined>(undefined);

  useEffect(() => {
    if (!database || id === null) return;
    return watchNote(database, id, { onNote: setNote, onError: () => undefined });
  }, [database, id]);

  return note;
}
