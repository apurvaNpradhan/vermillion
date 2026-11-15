import { exerciseUploadColumns } from "../exercise";
import { mediaUploadColumns } from "../media";
import { trainingUploadColumns } from "../training";

/** Per synced table, the columns an upload may carry (see `ConnectorOptions.uploadColumns`). */
export const uploadColumns: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["exercise", exerciseUploadColumns],
  ["media", mediaUploadColumns],
  ...Object.entries(trainingUploadColumns),
]);
