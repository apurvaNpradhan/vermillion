import { View } from "react-native";
import { DetailedTargets } from "./detailed-targets";
import { RestPicker } from "./rest-picker";
import type { WorkoutExerciseDetail } from "@workspace/sync";
import { useEffect, useRef, useState } from "react";

import { useCoalescedWriter } from "../use-coalesced-writer";
import { useWorkoutActions } from "../use-workout-actions";

export function InlineTargets({
  entry,
  grouped,
}: {
  entry: WorkoutExerciseDetail;
  grouped: boolean;
}) {
  const { updateExercise } = useWorkoutActions();
  const [draft, setDraft] = useState({ sets: entry.sets, restSeconds: entry.restSeconds });
  const latest = useRef(draft);
  const writer = useCoalescedWriter(
    (patch: { sets?: WorkoutExerciseDetail["sets"]; rest_seconds?: number | null }) =>
      updateExercise(entry.id, patch),
  );
  const { busy } = writer;
  useEffect(() => {
    if (!busy()) {
      const next = { sets: entry.sets, restSeconds: entry.restSeconds };
      latest.current = next;
      setDraft(next);
    }
  }, [entry.sets, entry.restSeconds, busy]);
  const onSets = (sets: WorkoutExerciseDetail["sets"]) => {
    const next = { ...latest.current, sets };
    latest.current = next;
    setDraft(next);
    writer.queue({ sets });
  };
  const onRest = (restSeconds: number | null) => {
    const next = { ...latest.current, restSeconds };
    latest.current = next;
    setDraft(next);
    writer.queue({ rest_seconds: restSeconds });
  };
  const type = entry.exercise?.exerciseType ?? "weight_reps";
  return (
    <View className="gap-3">
      <DetailedTargets sets={draft.sets} type={type} onSets={onSets} />
      {!grouped ? <RestPicker value={draft.restSeconds} onChange={onRest} /> : null}
    </View>
  );
}
