import { Directory, Paths } from "expo-file-system";

import { deviceStorage } from "@/platform/storage";

import { LEGACY_COVER_DIRECTORY, LEGACY_COVERS_REMOVED_KEY } from "./files";

/**
 * Program covers used to be local files in `documents/program-covers/` (ADR 0036). Covers are
 * media now and the old ones are not migrated (synthetic data only, ADR 0026): the folder is
 * deleted once, on the first launch after the update.
 */
export function deleteLegacyCovers(): void {
  if (deviceStorage.get(LEGACY_COVERS_REMOVED_KEY) === "1") return;
  try {
    const folder = new Directory(Paths.document, LEGACY_COVER_DIRECTORY);
    if (folder.exists) folder.delete();
    deviceStorage.set(LEGACY_COVERS_REMOVED_KEY, "1");
  } catch {
    // Left for the next start.
  }
}
