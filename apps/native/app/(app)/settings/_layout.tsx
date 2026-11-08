import { Stack } from "expo-router";

/** Settings and the pages pushed from it; each page draws its own header with a back button. */
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
