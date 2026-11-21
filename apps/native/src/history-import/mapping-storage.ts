import { sha256Hex, type ImportFormat } from "@workspace/shared";
import { z } from "zod";

import { deviceStorage } from "@/platform/storage";

const storageKey = (userId: string, format: ImportFormat, name: string) =>
  "history-import-mapping." + sha256Hex(JSON.stringify([userId, format, name]));

export function readMapping(userId: string, format: ImportFormat, name: string) {
  const parsed = z.uuid().safeParse(deviceStorage.get(storageKey(userId, format, name)));
  return parsed.success ? parsed.data : null;
}

export function saveMapping(userId: string, format: ImportFormat, name: string, id: string | null) {
  deviceStorage.set(storageKey(userId, format, name), id);
}
