import { AttachmentState } from "@powersync/common";
import { mediaAttachmentId, type MediaVariant } from "@workspace/shared";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { z } from "zod";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useLocalData } from "@/sync";

import { mediaFile, type MediaFile, type MediaFileState } from "./media-state";

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
export function useMediaImage(mediaId: string | null, variant: MediaVariant): MediaImageState {
  const local = useLocalData();
  const queue = local?.status === "ready" ? local.media : null;
  const attachmentId = mediaId === null ? null : mediaAttachmentId(mediaId, variant);

  const subscribe = useCallback(
    (
      database: Parameters<Parameters<typeof useLocalWatch>[0]>[0],
      onValue: (row: { present: boolean; state: number | null; uri: string | null }) => void,
      onError: () => void,
    ) => {
      if (mediaId === null || attachmentId === null) {
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
    [mediaId, attachmentId],
  );
  const { value } = useLocalWatch(subscribe);

  const failed = useSyncExternalStore(
    queue ? queue.failures.subscribe : noSubscription,
    () => queue !== null && attachmentId !== null && queue.failures.has(attachmentId),
    () => false,
  );

  const rawState = value?.state ?? null;
  const present = value?.present ?? false;
  // A full image is fetched when a view asks for it, and counts as used while it is shown.
  useEffect(() => {
    if (!queue || mediaId === null || variant !== "full" || !present) return;
    if (rawState === null || rawState === AttachmentState.ARCHIVED) {
      void queue.wantFull(mediaId).catch(() => undefined);
    } else if (rawState === AttachmentState.SYNCED) {
      void queue.touchFull(mediaId).catch(() => undefined);
    }
  }, [queue, mediaId, variant, present, rawState]);

  const retry = useCallback(() => {
    if (queue && attachmentId !== null) void queue.retry(attachmentId).catch(() => undefined);
  }, [queue, attachmentId]);

  const file: MediaFile = mediaFile(
    { mediaPresent: present, state: rawState, localUri: value?.uri ?? null },
    failed,
  );
  return { uri: file.uri, state: file.state, retry };
}
