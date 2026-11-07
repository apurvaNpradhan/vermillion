import { Button } from "@workspace/ui/components/button";
import { Card, CardHeader, CardPanel, CardTitle } from "@workspace/ui/components/card";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";

import { useNotes, type Note } from "../use-notes";
import { NoteForm } from "./note-form";

export function NotesPage() {
  const { t } = useTranslation();
  const { notes, isLoading, create, update, remove } = useNotes();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="font-semibold text-xl">{t("notes__title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle render={<h2 />}>{t("notes__new")}</CardTitle>
        </CardHeader>
        <CardPanel>
          <NoteForm
            initial={{ title: "", body: "" }}
            submitLabel={t("notes__add")}
            onSubmit={create}
          />
        </CardPanel>
      </Card>

      {notes.length === 0 ? (
        <p className="text-center text-muted-foreground">
          {isLoading ? t("common__loading") : t("notes__empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note: Note) => (
            <li key={note.id}>
              <Card data-testid="note">
                {editing === note.id ? (
                  <CardPanel>
                    <NoteForm
                      initial={note}
                      submitLabel={t("common__save")}
                      onSubmit={async (values) => {
                        await update({ id: note.id, ...values });
                        setEditing(null);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  </CardPanel>
                ) : (
                  <>
                    <CardHeader>
                      <CardTitle render={<h2 />}>{note.title}</CardTitle>
                    </CardHeader>
                    <CardPanel className="flex flex-col gap-3">
                      {note.body ? <p className="whitespace-pre-wrap">{note.body}</p> : null}
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditing(note.id)}>
                          {t("notes__edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive-outline"
                          onClick={() => void remove(note.id)}
                        >
                          {t("common__delete")}
                        </Button>
                      </div>
                    </CardPanel>
                  </>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
