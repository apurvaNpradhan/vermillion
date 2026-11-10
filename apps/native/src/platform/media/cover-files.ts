import { Directory, File, Paths } from "expo-file-system";

import { COVER_DIRECTORY, coverFileName, orphanedCoverFiles } from "./cover-names";

const directory = () => new Directory(Paths.document, COVER_DIRECTORY);

/** Moves a processed picture to its place in the documents directory and returns the file uri. */
export function storeCoverFile(programId: string, sourceUri: string): string {
  const folder = directory();
  folder.create({ intermediates: true, idempotent: true });
  const target = new File(folder, coverFileName(programId));
  if (target.exists) target.delete();
  new File(sourceUri).move(target);
  return target.uri;
}

/**
 * A cover file's uri with a version, so replacing the photo (the same path) makes the image view
 * load the new file instead of its cached copy.
 */
export function versionedCoverUri(uri: string): string {
  return `${uri}?v=${Date.now()}`;
}

/** Deletes one cover file (a versioned uri is fine); a missing file is fine. */
export function deleteCoverFile(uri: string): void {
  const file = new File(uri.split("?")[0] ?? uri);
  if (file.exists) file.delete();
}

/** Deletes every cover file except those of the given Programs (none: all of them). */
export function deleteCoversExcept(keepProgramIds: readonly string[]): void {
  const folder = directory();
  if (!folder.exists) return;
  const entries = folder.list();
  const doomed = new Set(
    orphanedCoverFiles(
      entries.map((entry) => entry.name),
      keepProgramIds,
    ),
  );
  for (const entry of entries) {
    if (doomed.has(entry.name)) entry.delete();
  }
}
