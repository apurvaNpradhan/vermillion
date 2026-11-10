import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { ExerciseFormScreen, selectCreated } from "@/exercise";

/** As `train/new-exercise`: `title` prefills the name; `pick` is the open picker's request id. */
const paramsSchema = z.object({ title: z.string().optional(), pick: z.string().optional() });

export default function NewExerciseFromSessionPicker() {
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
