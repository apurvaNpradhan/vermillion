import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { useStartSession } from "@/session";
import { WorkoutEditorScreen } from "@/training";

const paramsSchema = z.object({ id: z.string() });

export default function WorkoutRoute() {
  const router = useRouter();
  const { id } = paramsSchema.parse(useLocalSearchParams());
  const { start, sheet } = useStartSession();
  return (
    <>
      <WorkoutEditorScreen
        id={id}
        onOpenExercise={(entry) =>
          router.push({ pathname: "/train/workout/[id]/[entry]", params: { id, entry } })
        }
        onClosed={() => (router.canGoBack() ? router.back() : router.replace("/train"))}
        onOpenCopy={(copy) =>
          router.replace({ pathname: "/train/workout/[id]/edit", params: { id: copy } })
        }
        onStart={(workoutId) => void start(workoutId)}
      />
      {sheet}
    </>
  );
}
