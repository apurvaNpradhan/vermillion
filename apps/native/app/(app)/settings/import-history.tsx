import { Redirect } from "expo-router";

/** The import moved onto Your data; this keeps old links working. */
export default function ImportHistoryRoute() {
  return <Redirect href="/settings/data" />;
}
