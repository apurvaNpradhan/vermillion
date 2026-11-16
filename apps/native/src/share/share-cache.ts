import { Directory, File, Paths } from "expo-file-system";

const MAX_AGE_MS = 60 * 60 * 1000;
const cache = () => new Directory(Paths.cache, "share-cards");

/** Copy before releasing view-shot's temporary file. Recipients may read this copy later. */
export function ownCapture(uri: string, transparent: boolean): string {
  const directory = cache();
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(
    directory,
    `${Date.now()}-${Math.random().toString(36).slice(2)}.${transparent ? "png" : "jpg"}`,
  );
  new File(uri).copy(file);
  return file.uri;
}

/** Called on composer open. Files handed to other apps survive close and recapture for an hour. */
export function pruneShareCache(): void {
  try {
    const directory = cache();
    if (!directory.exists) return;
    for (const file of directory.list()) {
      const created = Number(file.name.split("-")[0]);
      if (file instanceof File && Number.isFinite(created) && Date.now() - created > MAX_AGE_MS) {
        file.delete();
      }
    }
  } catch {
    // Best effort: the OS also prunes its cache.
  }
}
