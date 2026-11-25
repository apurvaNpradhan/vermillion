import { randomUUID } from "expo-crypto";
import { Directory, Paths } from "expo-file-system";

const SHARE_GRACE_MS = 5_000;
const active = new Set<AbortController>();

const cache = () => new Directory(Paths.cache, "export");

function remove(directory: Directory) {
  try {
    if (directory.exists) directory.delete();
  } catch {
    // Startup and sign-out retry anything left in the export cache.
  }
}

/** Also removes flat files left by older builds. Abort any writes before removing the cache. */
export function sweepExportFiles() {
  for (const task of active) task.abort();
  remove(cache());
}

export function createExportDirectory(task: AbortController) {
  const directory = new Directory(cache(), randomUUID());
  directory.create({ intermediates: true });
  active.add(task);
  return directory;
}

export function releaseExportDirectory(
  directory: Directory,
  task: AbortController,
  shared: boolean,
) {
  active.delete(task);
  // Android may return as soon as a target is picked. Give it time to open the shared URI.
  if (shared) setTimeout(() => remove(directory), SHARE_GRACE_MS);
  else remove(directory);
}
