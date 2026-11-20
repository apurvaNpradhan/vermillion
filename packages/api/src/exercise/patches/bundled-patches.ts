import type { PatchSource } from "./apply-patches";

/**
 * The committed Catalog patches (`../data/patches/NNNN-<name>.json`). The server bundle inlines
 * JSON, so each file is imported here and listed; a test fails when a file in the folder is
 * missing from the list. The text is the file's content re-serialised, which fingerprints the
 * same for the same content.
 *
 * To add a patch: put the file in the folder, import it below and add a line to the array.
 */
export function bundledPatches(): PatchSource[] {
  return [];
}
