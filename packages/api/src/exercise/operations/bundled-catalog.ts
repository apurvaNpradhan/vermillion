import catalog from "../data/exercises.json";

/**
 * The committed catalog file as text. The server bundle inlines the JSON, so there are no file
 * bytes at runtime: the text is the file's content re-serialised, which fingerprints the same
 * for the same content.
 */
export function bundledCatalogText(): string {
  return JSON.stringify(catalog);
}
