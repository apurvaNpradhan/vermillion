import {
  REJECTED_WRITES_LIMIT,
  discardRejectedWrite,
  rejectedRetryValues,
  retryRejectedNote,
  watchRejectedWrites,
  type NoteValues,
  type RejectedWrite,
} from "@workspace/sync";
import { toastManager } from "@workspace/ui/components/toast";
import { useEffect, useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { useLocalData } from "@/sync";

/**
 * Writes the server refused, from the local-only table (ADR 0018). They stay on this device until
 * the user retries them as a new local transaction or discards them. Only reasons are shown to
 * the user (mapped codes), and nothing here logs a payload.
 */
export function useRejectedNotes() {
  const { t } = useTranslation();
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const [state, setState] = useState<{ writes: RejectedWrite[]; hasMore: boolean }>({
    writes: [],
    hasMore: false,
  });

  useEffect(() => {
    if (!database) return;
    return watchRejectedWrites(
      database,
      { onResult: setState, onError: () => undefined },
      REJECTED_WRITES_LIMIT,
    );
  }, [database]);

  return {
    writes: state.writes,
    hasMore: state.hasMore,
    /** The values the retry form starts with. */
    loadValues: async (write: RejectedWrite): Promise<NoteValues> =>
      database ? rejectedRetryValues(database, write) : { title: "", body: "" },
    /** Throws when the values are invalid so the form keeps the user's text. */
    retry: async (id: string, values: NoteValues) => {
      if (!database) throw new Error("Local storage is not available");
      const result = await retryRejectedNote(database, id, values);
      if (result === "invalid") {
        toastManager.add({ type: "error", title: t("sync__rejected_invalid") });
        throw new Error("Invalid note values");
      }
      toastManager.add({
        type: "success",
        title: t(
          result === "saved-as-new" ? "sync__rejected_saved_as_new" : "sync__rejected_retried",
        ),
      });
    },
    discard: async (id: string) => {
      if (!database) throw new Error("Local storage is not available");
      await discardRejectedWrite(database, id);
    },
  };
}
