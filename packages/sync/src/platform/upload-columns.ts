import { exerciseUploadColumns } from "../exercise";
import { mediaUploadColumns } from "../media";
import { preferencesUploadColumns } from "../preferences";
import { trainingUploadColumns } from "../training";

/** Per synced table, the columns an upload may carry (see `ConnectorOptions.uploadColumns`). */
export const uploadColumns: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["exercise", exerciseUploadColumns],
  [
    "body_measurement",
    new Set(["metric", "value", "measured_at", "local_date", "source", "restore"]),
  ],
  ["progress_photo", new Set(["media_id", "pose", "taken_at", "local_date"])],
  ["media", mediaUploadColumns],
  ["user_preferences", preferencesUploadColumns],
  ...Object.entries(trainingUploadColumns),
]);
