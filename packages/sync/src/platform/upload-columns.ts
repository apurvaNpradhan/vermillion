import { notesUploadColumns } from "../notes";

/** Per synced table, the columns an upload may carry (see `ConnectorOptions.uploadColumns`). */
export const uploadColumns: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["notes", notesUploadColumns],
]);
