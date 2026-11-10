import { useRouter } from "expo-router";

import { NewProgramScreen } from "@/training";

/** New program: a title, then the Program screen replaces the sheet. */
export default function NewProgramRoute() {
  const router = useRouter();
  return (
    <NewProgramScreen
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/train"))}
      onCreated={(id) => router.replace({ pathname: "/train/program/[id]", params: { id } })}
    />
  );
}
