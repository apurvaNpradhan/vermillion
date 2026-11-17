import { useState, type ReactElement } from "react";

import { useT } from "@/platform/i18n";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/platform/ui/alert-dialog";
import { Button } from "@/platform/ui/button";
import { Input } from "@/platform/ui/input";

/**
 * A destructive action behind a confirmation. `typed` makes the admin type a value (the account's
 * email for a delete) before the action unlocks.
 */
export function ConfirmAction({
  trigger,
  title,
  body,
  action,
  typed,
  onConfirm,
}: {
  trigger: ReactElement;
  title: string;
  body: string;
  action: string;
  typed?: string;
  onConfirm: () => Promise<void> | void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = typed !== undefined && value.trim().toLowerCase() !== typed.toLowerCase();
  return (
    <AlertDialog open={open} onOpenChange={(next) => (setOpen(next), setValue(""))}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
          {typed !== undefined ? (
            <Input
              aria-label={t("admin__confirm_type", { value: typed })}
              placeholder={typed}
              value={value}
              onChange={(event) => setValue(event.currentTarget.value)}
            />
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>
            {t("admin__cancel")}
          </AlertDialogClose>
          <Button
            variant="destructive"
            disabled={locked || busy}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {action}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
