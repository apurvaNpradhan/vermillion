import { Redirect } from "expo-router";

/** The import moved to Import & export; this keeps old links working. */
export default function ImportHistoryRoute() {
  return <Redirect href="/settings/data" />;
}
