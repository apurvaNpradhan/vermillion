import { rejectionMessageKey } from "@workspace/client/sync-rejection";
import { rejectedNoteFields, type NoteValues, type RejectedWrite } from "@workspace/sync";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";

import { useRejectedNotes } from "../use-rejected-notes";
import { NoteForm } from "./note-form";

/** Changes the server refused, with the reason and the two ways out: edit and retry, or discard. */
export function RejectedNotes() {
  const { t } = useTranslation();
  const { writes, hasMore, loadValues, retry, discard } = useRejectedNotes();
  const [editing, setEditing] = useState<{ id: string; initial: NoteValues } | null>(null);
  const [discarding, setDiscarding] = useState<string | null>(null);

  if (writes.length === 0) return null;

  return (
    <section aria-labelledby="rejected-notes-title" className="flex flex-col gap-3">
      <Alert variant="warning">
        <AlertTitle id="rejected-notes-title">{t("sync__rejected_title")}</AlertTitle>
        <AlertDescription>{t("sync__rejected_description")}</AlertDescription>
      </Alert>
      <ul className="flex flex-col gap-3">
        {writes.map((write) => (
          <li
            key={write.id}
            data-testid="rejected-write"
            className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-body"
          >
            <RejectedSummary write={write} />
            {editing?.id === write.id ? (
              <NoteForm
                initial={editing.initial}
                submitLabel={t("sync__rejected_send")}
                onSubmit={async (values) => {
                  await retry(write.id, values, editing.initial);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex gap-2">
                {write.truncated ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void loadValues(write).then((initial) =>
                        write.op === "DELETE"
                          ? retry(write.id, initial)
                          : setEditing({ id: write.id, initial }),
                      )
                    }
                  >
                    {write.op === "DELETE" ? t("sync__rejected_send") : t("sync__rejected_retry")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive-outline"
                  onClick={() => setDiscarding(write.id)}
                >
                  {t("sync__rejected_discard")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {hasMore ? (
        <p className="text-body text-muted-foreground">{t("sync__rejected_more")}</p>
      ) : null}

      <AlertDialog open={discarding !== null} onOpenChange={(open) => !open && setDiscarding(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sync__rejected_discard_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("sync__rejected_discard_body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {t("common__cancel")}
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                const id = discarding;
                setDiscarding(null);
                if (id) void discard(id);
              }}
            >
              {t("sync__rejected_discard_confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </section>
  );
}

function RejectedSummary({ write }: { write: RejectedWrite }) {
  const { t } = useTranslation();
  const fields = rejectedNoteFields(write);
  const operation =
    write.op === "PUT"
      ? t("sync__rejected_op_put")
      : write.op === "PATCH"
        ? t("sync__rejected_op_patch")
        : t("sync__rejected_op_delete");
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">
        {operation}
        {fields?.title ? `: ${fields.title}` : ""}
      </p>
      <p className="text-muted-foreground">{t(rejectionMessageKey(write.code))}</p>
      {write.truncated ? (
        <p className="text-muted-foreground">{t("sync__rejected_too_large")}</p>
      ) : null}
    </div>
  );
}
