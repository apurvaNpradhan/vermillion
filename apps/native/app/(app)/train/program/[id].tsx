import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { ProgramScreen } from "@/training";

const paramsSchema = z.object({ id: z.string() });

export default function ProgramRoute() {
  const router = useRouter();
  const { id } = paramsSchema.parse(useLocalSearchParams());
  return (
    <ProgramScreen
      id={id}
      onOpenWorkout={(workoutId) =>
        router.push({ pathname: "/train/workout/[id]", params: { id: workoutId } })
      }
      onOpenDetails={() => router.push({ pathname: "/train/program/[id]/details", params: { id } })}
      onClosed={() => (router.canGoBack() ? router.back() : router.replace("/train"))}
      onOpenCopy={(copy) =>
        router.replace({ pathname: "/train/program/[id]", params: { id: copy } })
      }
    />
  );
}
