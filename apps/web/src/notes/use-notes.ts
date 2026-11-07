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
import { toastManager } from "@workspace/ui/components/toast";
import { useCallback, useEffect, useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { useLocalData, useSyncStatus } from "@/sync";

/**
 * The signed-in user's notes, read from and written to the local database (ADR 0016). Writes
 * return as soon as they are saved on this device and upload in the background. The list is
 * bounded: `loadMore` widens the window by one page.
 */
export function useNotes() {
  const { t } = useTranslation();
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
      if (!database) throw new Error("Local storage is not available");
      try {
        await action(database);
      } catch (error) {
        toastManager.add({ type: "error", title: t("errors__unknown") });
        throw error;
      }
    },
    [database, t],
  );

  return {
    notes: page?.notes ?? [],
    isLoading: local === null || (database !== null && page === null && !loadFailed),
    /** A local read failed: not the same as "no notes". */
    loadFailed,
    /** The first full sync has not finished, so an empty list may only mean "not downloaded yet". */
    isFirstSync:
      snapshot !== null &&
      !snapshot.hasSynced &&
      snapshot.indicator !== "paused" &&
      snapshot.lockReason === null,
    /** Why this browser cannot keep notes on the device, when it cannot. */
    unavailableReason: local?.status === "unavailable" ? local.reason : null,
    hasMore: page?.hasMore ?? false,
    loadMore: () => setLimit((current) => current + NOTES_PAGE_SIZE),
    create: async (input: { title: string; body: string }) => {
      await write((db) => createNote(db, input));
    },
    /** Sends only the fields in the patch; pass the dirty fields of the form (`draftPatch`). */
    update: async (input: { id: string } & NotePatch) => {
      const { id, ...patch } = input;
      await write((db) => updateNote(db, id, patch));
    },
    remove: async (id: string) => {
      await write((db) => deleteNote(db, id));
    },
  };
}

/**
 * One note, live: the row, `null` once it is gone, `undefined` before the first read. An open
 * edit form follows it so a change elsewhere reaches the form without overwriting the user's text.
 */
export function useLiveNote(id: string): LocalNote | null | undefined {
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const [note, setNote] = useState<LocalNote | null | undefined>(undefined);

  useEffect(() => {
    if (!database) return;
    return watchNote(database, id, { onNote: setNote, onError: () => undefined });
  }, [database, id]);

  return note;
}

export type Note = LocalNote;
