import type { CustomExerciseInput } from "@workspace/shared";
import {
  archiveExercise,
  createCustomExercise,
  restoreExercise,
  updateCustomExercise,
  type ExerciseDatabase,
  type ExercisePatch,
} from "@workspace/sync";
import { isNetworkError } from "@workspace/client/network-error";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useCallback } from "react";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useLocalData, useSyncStatus } from "@/sync";

/** How long the toast after archiving offers Undo. */
const UNDO_MS = 5000;

/**
 * Writes to the user's Custom exercises, on the local database (ADR 0016): each returns once the
 * change is saved on the device and uploads in the background. Archiving shows a toast with Undo,
 * and restoring says so. A failed write shows a toast and throws, so a form keeps its values.
 */
export function useExerciseActions() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const local = useLocalData();
  const { snapshot } = useSyncStatus();
  const writeScope = snapshot?.writeScope ?? "";
  const database = local?.status === "ready" ? local.database : null;

  const write = useCallback(
    async <R>(action: (db: ExerciseDatabase) => Promise<R>): Promise<R> => {
      try {
        if (!database) throw new Error("Local storage is not available");
        return await action(database);
      } catch (error) {
        if (error instanceof Error && isNetworkError(error)) throw error;
        const limit = error instanceof Error && error.message.startsWith("Too many custom");
        toast.show({
          variant: "danger",
          label: t(limit ? "exercise__limit_reached" : "errors__unknown"),
        });
        throw error;
      }
    },
    [database, t, toast],
  );

  const create = useCallback(
    (input: CustomExerciseInput) => write((db) => createCustomExercise(db, input, writeScope)),
    [write, writeScope],
  );
  /** Sends only the fields in the patch; pass the dirty fields of the form (`exerciseDraftPatch`). */
  const update = useCallback(
    (id: string, patch: ExercisePatch) =>
      write((db) => updateCustomExercise(db, id, patch, writeScope)),
    [write, writeScope],
  );
  const restore = useCallback(
    async (id: string) => {
      await write((db) => restoreExercise(db, id, writeScope));
      haptic.confirm();
      toast.show({ label: t("exercise__restored_toast") });
    },
    [write, writeScope, t, toast],
  );
  const archive = useCallback(
    async (id: string, title: string) => {
      await write((db) => archiveExercise(db, id, writeScope));
      haptic.confirm();
      toast.show({
        label: t("exercise__archived_toast", { title }),
        actionLabel: t("common__undo"),
        duration: UNDO_MS,
        onActionPress: ({ hide }) => {
          hide();
          // The archive is already saved; Undo brings the same row back.
          void write((db) => restoreExercise(db, id, writeScope)).catch(() => undefined);
        },
      });
    },
    [write, writeScope, t, toast],
  );

  return { create, update, archive, restore };
}
