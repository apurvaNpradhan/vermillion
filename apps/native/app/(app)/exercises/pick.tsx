import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { ExercisePickScreen } from "@/exercise";

/** The picker's request id, from `usePickExercises`. */
const paramsSchema = z.object({ request: z.string() });

export default function PickExercises() {
  const router = useRouter();
  const params = paramsSchema.safeParse(useLocalSearchParams());
  // Without a request nobody is waiting for an answer (a stale link): close.
  const request = params.success ? params.data.request : "";
  return (
    <ExercisePickScreen
      requestId={request}
      onCreate={(title) =>
        router.push({
          pathname: "/exercises/new",
          params: title === "" ? { pick: request } : { pick: request, title },
        })
      }
    />
  );
}
