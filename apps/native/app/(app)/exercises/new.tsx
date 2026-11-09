import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { ExerciseFormScreen, selectCreated } from "@/exercise";

/**
 * `title` prefills the name, from "Create ‹query›" in the library's no-results state. `pick` is the
 * open picker's request id: the new exercise is selected there once it is saved.
 */
const paramsSchema = z.object({ title: z.string().optional(), pick: z.string().optional() });

export default function NewExercise() {
  const router = useRouter();
  const params = paramsSchema.safeParse(useLocalSearchParams());
  const title = params.success ? (params.data.title ?? "") : "";
  const pick = params.success ? params.data.pick : undefined;
  return (
    <ExerciseFormScreen
      target={{ kind: "new", title }}
      onClose={() => router.back()}
      onCreated={pick === undefined ? undefined : (id) => selectCreated(pick, id)}
    />
  );
}
