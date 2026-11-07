import {
  NOTES_PAGE_SIZE,
  createNote,
  deleteNote,
  updateNote,
  watchNotes,
  type NotePatch,
  type NotesDatabase,
  type NotesPage,
} from "@workspace/sync";
import { useToast } from "heroui-native";
import { useCallback, useEffect, useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { useLocalData } from "@/sync";

/**
 * The signed-in user's notes, read from and written to the local database (ADR 0016). Writes
 * return as soon as they are saved on the device and upload in the background. The list is
 * bounded: `loadMore` widens the window by one page.
 */
export function useNotes() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const local = useLocalData();
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
        toast.show({ variant: "danger", label: t("errors__unknown") });
        throw error;
      }
    },
    [database, t, toast],
  );

  return {
    notes: page?.notes ?? [],
    isLoading: local === null || (database !== null && page === null && !loadFailed),
    /** A local read failed: not the same as "no notes". */
    loadFailed,
    hasMore: page?.hasMore ?? false,
    loadMore: () => setLimit((current) => current + NOTES_PAGE_SIZE),
    create: async (input: { title: string; body: string }) => {
      await write((db) => createNote(db, input));
    },
    /** Sends only the fields that differ from the saved note; a partial patch is fine. */
    update: async (input: { id: string } & NotePatch) => {
      const { id, ...patch } = input;
      await write((db) => updateNote(db, id, patch));
    },
    remove: async (id: string) => {
      await write((db) => deleteNote(db, id));
    },
  };
}
