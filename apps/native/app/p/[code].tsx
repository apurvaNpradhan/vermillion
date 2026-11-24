import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * The App Link `https://<site>/p/<code>` (and `sigil://p/<code>`): opens the import preview. The
 * preview reads the kind from the snapshot, so a Program and a Workout code share one screen.
 */
export default function ProgramLinkRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={{ pathname: "/import/[code]", params: { code: code ?? "" } }} />;
}
