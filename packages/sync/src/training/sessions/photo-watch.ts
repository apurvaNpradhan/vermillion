import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { z } from "zod";
const photo = z.object({ id: z.string(), media_id: z.string(), position: z.number() });
export type SessionPhoto = z.infer<typeof photo>;
export function watchSessionPhotos(
  db: AbstractPowerSyncDatabase,
  id: string,
  onValue: (rows: SessionPhoto[]) => void,
  onError: () => void,
) {
  const controller = new AbortController();
  db.watchWithCallback(
    "SELECT id, media_id, position FROM session_photo WHERE session_id = ? ORDER BY position, id LIMIT 4",
    [id],
    {
      onResult: (result) => {
        const parsed = z.array(photo).safeParse(result.array);
        if (parsed.success) onValue(parsed.data);
        else onError();
      },
      onError,
    },
    { signal: controller.signal, tables: ["session_photo"] },
  );
  return () => controller.abort();
}
