import { runWeek } from "@workspace/shared";
import { insertDeloadNow } from "@workspace/sync";
import { useState } from "react";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useTrainingWrite } from "@/training/shared/use-training-write";

/**
 * "Insert deload now": asks first, then turns this Run week into a Deload and shifts the weeks
 * after it by one. Render `dialog` next to the control that calls `ask`. `run` is the active Run
 * (null when there is none, and nothing happens).
 */
export function useInsertDeload(run: { id: string; started_at: string | null } | null) {
  const { t } = useTranslation();
  const { write, writeScope } = useTrainingWrite();
  const timeZone = useDeviceTimeZone();
  const insert = () =>
    run
      ? write(
          (db) =>
            insertDeloadNow(db, run.id, runWeek(run.started_at, new Date(), timeZone), writeScope),
          false,
        )
      : Promise.resolve(false);
  const { toast } = useAppToast();
  const [open, setOpen] = useState(false);
  return {
    ask: () => setOpen(true),
    dialog: (
      <ConfirmationDialog
        isOpen={open}
        onOpenChange={setOpen}
        title={t("phase__insert_title")}
        description={t("phase__insert_body")}
        cancelLabel={t("common__cancel")}
        confirmLabel={t("phase__insert_confirm")}
        onConfirm={() => {
          void insert().then((done) => {
            if (!done) return;
            haptic.confirm();
            toast.show({ label: t("phase__insert_toast") });
          });
        }}
      />
    ),
  };
}
