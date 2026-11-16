import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { SessionShareScreen } from "@/session";

// Workout and Program join in the next slice.
const paramsSchema = z.object({ kind: z.enum(["session"]), id: z.string() });

/** The Share composer for one thing, by kind. */
export default function ShareRoute() {
  const router = useRouter();
  const params = paramsSchema.safeParse(useLocalSearchParams());
  if (!params.success) return <Redirect href="/" />;
  return (
    <SessionShareScreen
      id={params.data.id}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    />
  );
}
