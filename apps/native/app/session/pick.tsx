import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { ExercisePickScreen } from "@/exercise";

/** The picker's request id, from `usePickExercises("session")`. */
const paramsSchema = z.object({ request: z.string() });

/** The exercise picker, shown over the Session so closing it returns to the logging screen. */
export default function PickExercisesForSession() {
  const router = useRouter();
  const params = paramsSchema.safeParse(useLocalSearchParams());
  const request = params.success ? params.data.request : "";
  return (
    <ExercisePickScreen
      requestId={request}
      closeFallback="/"
      onCreate={(title) =>
        router.push({
          pathname: "/session/new-exercise",
          params: title === "" ? { pick: request } : { pick: request, title },
        })
      }
    />
  );
}
