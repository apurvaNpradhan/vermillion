import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { ExercisePickScreen } from "@/exercise";

/** The picker's request id, from `usePickExercises("train")`. */
const paramsSchema = z.object({ request: z.string() });

/** The exercise picker, shown over the Train tab so closing it returns to the screen below. */
export default function PickExercises() {
  const router = useRouter();
  const params = paramsSchema.safeParse(useLocalSearchParams());
  const request = params.success ? params.data.request : "";
  return (
    <ExercisePickScreen
      requestId={request}
      closeFallback="/train"
      onCreate={(title) =>
        router.push({
          pathname: "/train/new-exercise",
          params: title === "" ? { pick: request } : { pick: request, title },
        })
      }
    />
  );
}
