import { File } from "expo-file-system";
import { AttachmentState } from "@powersync/common";
import { mediaAttachmentId, type MediaVariant } from "@workspace/shared";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { z } from "zod";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useLocalData } from "@/sync";

import { mediaFile, type MediaFile, type MediaFileState } from "./media-state";

import { useImageBatch } from "./media-image-batch";

const fileRow = z.array(
  z.object({ state: z.number().nullable(), local_uri: z.string().nullable() }),
);

const FILE_SQL = `SELECT a.state AS state, a.local_uri AS local_uri
  FROM media m LEFT JOIN attachments a ON a.id = ?
  WHERE m.id = ? LIMIT 1`;

const noSubscription = () => () => undefined;

export type MediaImageState = {
  /** The file to draw, or null while there is none. */
  uri: string | null;
  state: MediaFileState;
  /** Tries a failed transfer again now. */
  retry: () => void;
};

/**
 * One image of a media as this device has it (ADR 0040): the local file once there is one, and
 * the state of its transfer. `thumb` downloads on its own; `full` is requested here and cached
 * with a size cap. A media row renders at once from the local file while it uploads.
 */
export function useMediaImage(
  mediaId: string | null,
  variant: MediaVariant,
  localOnly = false,
): MediaImageState {
  const batch = useImageBatch();
  const batched = variant === "thumb" && batch !== null;
  const local = useLocalData();
  const queue = local?.status === "ready" ? local.media : null;
  const attachmentId = mediaId === null ? null : mediaAttachmentId(mediaId, variant);

  const subscribe = useCallback(
    (
      database: Parameters<Parameters<typeof useLocalWatch>[0]>[0],
      onValue: (row: { present: boolean; state: number | null; uri: string | null }) => void,
      onError: () => void,
    ) => {
      if (batched || mediaId === null || attachmentId === null) {
        onValue({ present: false, state: null, uri: null });
        return () => undefined;
      }
      const controller = new AbortController();
      database.watchWithCallback(
        FILE_SQL,
        [attachmentId, mediaId],
        {
          onResult: (result) => {
            const row = fileRow.parse(result.array)[0];
            onValue({
              present: row !== undefined,
              state: row?.state ?? null,
              uri: row?.local_uri ?? null,
            });
          },
          onError,
        },
        { signal: controller.signal, tables: ["media", "attachments"] },
      );
      return () => controller.abort();
    },
    [mediaId, attachmentId, batched],
  );
  const watched = useLocalWatch(subscribe);
  const value = batched ? batch?.get(mediaId ?? "") : watched.value;

  const failed = useSyncExternalStore(
    queue ? queue.failures.subscribe : noSubscription,
    () => queue !== null && attachmentId !== null && queue.failures.has(attachmentId),
    () => false,
  );

  const rawState = value?.state ?? null;
  const present = value?.present ?? false;
  // A full image is fetched when a view asks for it, and counts as used while it is shown.
  useEffect(() => {
    if (localOnly || !queue || mediaId === null || variant !== "full" || !present) return;
    if (rawState === null || rawState === AttachmentState.ARCHIVED) {
      void queue.wantFull(mediaId).catch(() => undefined);
    } else if (rawState === AttachmentState.SYNCED) {
      void queue.touchFull(mediaId).catch(() => undefined);
    }
  }, [queue, mediaId, variant, present, rawState, localOnly]);

  const retry = useCallback(() => {
    if (!localOnly && queue && attachmentId !== null)
      void queue.retry(attachmentId).catch(() => undefined);
  }, [queue, attachmentId, localOnly]);

  const file: MediaFile = mediaFile(
    { mediaPresent: present, state: rawState, localUri: value?.uri ?? null },
    failed,
  );
  if (localOnly) {
    // Only local file URIs are drawable here. Never pass a remote source to expo-image.
    let uri: string | null = null;
    try {
      if (file.uri?.startsWith("file://") && new File(file.uri).exists) uri = file.uri;
    } catch {
      // Evicted or unreadable local files fall back to the avatar.
    }
    return {
      uri,
      state: uri
        ? "local"
        : !batched && watched.loading && mediaId !== null
          ? "downloading"
          : "missing",
      retry,
    };
  }
  return { uri: file.uri, state: file.state, retry };
}
