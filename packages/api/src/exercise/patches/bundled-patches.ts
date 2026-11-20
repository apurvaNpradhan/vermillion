import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { PatchSource } from "./apply-patches";

/**
 * Where the committed Catalog patches (`NNNN-<name>.json`) are: next to the source in development
 * and tests, in `patches/` beside the bundle once built (tsdown copies the folder, as it does
 * the migrations). They are read as files, never imported, so a patch's fingerprint is the hash
 * of its exact bytes: a whitespace-only edit of an applied file is still refused.
 */
const FOLDERS = [
  fileURLToPath(new URL("../data/patches/", import.meta.url)),
  fileURLToPath(new URL("./patches/", import.meta.url)),
];

export function bundledPatchesFolder(): string {
  const found = FOLDERS.find((folder) => existsSync(folder));
  if (!found) throw new Error("The Catalog patches folder is missing from this build");
  return found;
}

/** The patch files in `folder` (the committed ones by default), in name order, as raw text. */
export function bundledPatches(folder: string = bundledPatchesFolder()): PatchSource[] {
  return readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .toSorted()
    .map((name) => ({ name, text: readFileSync(`${folder}/${name}`, "utf8") }));
}
