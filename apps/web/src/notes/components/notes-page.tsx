import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Card, CardHeader, CardPanel, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useRef, useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { StorageUnavailable } from "@/platform/powersync";
import { SyncStatusLine } from "@/sync";

import { useNotes, type Note } from "../use-notes";
import { EditNote } from "./edit-note";
import { NoteForm } from "./note-form";
import { RejectedNotes } from "./rejected-notes";

const ESTIMATED_NOTE_HEIGHT = 150;

export function NotesPage() {
  const { t } = useTranslation();
  const {
    notes,
    isLoading,
    loadFailed,
    isFirstSync,
    unavailableReason,
    hasMore,
    loadMore,
    create,
    update,
    remove,
  } = useNotes();
  const [editing, setEditing] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Only the visible notes are mounted; the window grows a page at a time with "Show more".
  const virtualizer = useWindowVirtualizer({
    count: notes.length,
    estimateSize: () => ESTIMATED_NOTE_HEIGHT,
    overscan: 6,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    getItemKey: (index) => notes[index]?.id ?? index,
  });

  if (unavailableReason) return <StorageUnavailable reason={unavailableReason} />;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-xl">{t("notes__title")}</h1>
        <SyncStatusLine />
      </div>

      <RejectedNotes />

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

      {loadFailed ? (
        <Alert variant="error">
          <AlertDescription>{t("notes__load_failed")}</AlertDescription>
        </Alert>
      ) : null}

      {notes.length === 0 && !loadFailed ? (
        isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label={t("common__loading")}>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <p className="text-center text-muted-foreground">
            {isFirstSync ? t("notes__first_sync") : t("notes__empty")}
          </p>
        )
      ) : (
        <div
          ref={listRef}
          role="list"
          aria-label={t("notes__list_label")}
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const note: Note | undefined = notes[item.index];
            if (!note) return null;
            return (
              <div
                key={item.key}
                role="listitem"
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full pb-3"
                style={{
                  transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                <Card data-testid="note">
                  {editing === note.id ? (
                    <CardPanel>
                      <EditNote
                        note={note}
                        onSave={(patch) => update({ id: note.id, ...patch })}
                        onSaveAsNew={create}
                        onDone={() => setEditing(null)}
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
              </div>
            );
          })}
        </div>
      )}

      {hasMore ? (
        <Button variant="outline" className="self-center" onClick={loadMore}>
          {t("notes__load_more")}
        </Button>
      ) : null}
    </div>
  );
}
