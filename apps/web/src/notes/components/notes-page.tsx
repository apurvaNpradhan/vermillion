import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Card, CardHeader, CardPanel, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useCallback, useEffect, useRef, useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { StorageUnavailable } from "@/platform/powersync";
import { SyncStatusLine } from "@/sync";

import { useNotes, type Note } from "../use-notes";
import { NoteForm } from "./note-form";
import { NoteItem } from "./note-item";
import { RejectedNotes } from "./rejected-notes";

const ESTIMATED_NOTE_HEIGHT = 150;
const LOAD_MORE_THRESHOLD = 10;

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
  const stopEditing = useCallback(() => setEditing(null), []);
  const listRef = useRef<HTMLDivElement>(null);
  // Only the visible notes are mounted; the window grows a page at a time as the end is scrolled into view.
  const virtualizer = useWindowVirtualizer({
    count: notes.length,
    estimateSize: () => ESTIMATED_NOTE_HEIGHT,
    overscan: 6,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    getItemKey: (index) => notes[index]?.id ?? index,
  });

  // Infinite scroll: widen the window when the last rows come into view.
  const lastVisible = virtualizer.getVirtualItems().at(-1)?.index ?? -1;
  useEffect(() => {
    if (hasMore && lastVisible >= notes.length - LOAD_MORE_THRESHOLD) loadMore();
  }, [hasMore, lastVisible, notes.length, loadMore]);

  if (unavailableReason) return <StorageUnavailable reason={unavailableReason} />;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-title-xl">{t("notes__title")}</h1>
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
                <NoteItem
                  note={note}
                  isEditing={editing === note.id}
                  onEdit={setEditing}
                  onRemove={remove}
                  onSave={update}
                  onSaveAsNew={create}
                  onDone={stopEditing}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
