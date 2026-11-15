import { exerciseUploadColumns } from "../exercise";
import { trainingUploadColumns } from "../training";

/** Per synced table, the columns an upload may carry (see `ConnectorOptions.uploadColumns`). */
export const uploadColumns: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["exercise", exerciseUploadColumns],
  [
    "body_measurement",
    new Set(["metric", "value", "measured_at", "local_date", "source", "restore"]),
  ],
  ...Object.entries(trainingUploadColumns),
]);
