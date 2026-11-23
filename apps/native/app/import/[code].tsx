import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { normalizeShareCode } from "@workspace/shared";

import { ImportPreviewScreen } from "@/training";

/** The preview of a Share link: what it holds, then "Add to my programs/workouts". */
export default function ImportRoute() {
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = normalizeShareCode(raw ?? "");
  if (!code) return <Redirect href="/import" />;
  return (
    <ImportPreviewScreen
      code={code}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    />
  );
}
