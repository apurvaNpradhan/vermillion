import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { z } from "zod";

import { ProgramDetailsScreen } from "@/training";

const paramsSchema = z.object({ id: z.string() });

export default function ProgramDetailsRoute() {
  const router = useRouter();
  const { id } = paramsSchema.parse(useLocalSearchParams());
  const close = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace("/train")),
    [router],
  );
  return <ProgramDetailsScreen id={id} onClose={close} />;
}
