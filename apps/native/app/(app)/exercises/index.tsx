import { MUSCLE_GROUPS } from "@workspace/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { z } from "zod";

import { ExerciseLibrary, useExerciseActions } from "@/exercise";

/** Search params the library accepts: a muscle group to filter by (sent by "Browse <group>"). */
const paramsSchema = z.object({
  muscle: z.enum(MUSCLE_GROUPS).optional(),
  at: z.string().optional(),
});

export default function Exercises() {
  const router = useRouter();
  const { archive, restore } = useExerciseActions();
  const params = paramsSchema.safeParse(useLocalSearchParams());
  const browse = params.success ? params.data : {};
  const onCreate = useCallback(
    (title: string) =>
      router.push({ pathname: "/exercises/new", params: title === "" ? {} : { title } }),
    [router],
  );
  const onArchive = useCallback(
    (id: string, title: string) => void archive(id, title).catch(() => undefined),
    [archive],
  );
  const onRestore = useCallback((id: string) => void restore(id).catch(() => undefined), [restore]);
  return (
    <ExerciseLibrary
      mode="browse"
      browseMuscle={
        browse.muscle === undefined ? undefined : { muscle: browse.muscle, at: browse.at }
      }
      onOpen={(id) => router.push({ pathname: "/exercises/[id]", params: { id } })}
      onCreate={onCreate}
      onArchive={onArchive}
      onRestore={onRestore}
    />
  );
}
