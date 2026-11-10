import { useRouter } from "expo-router";
import { useCallback } from "react";

import { usePickExercises } from "@/exercise";

import { useWorkoutActions } from "./use-workout-actions";

/**
 * Starting a Workout. `fromPicker` opens the library in pick mode and, once something is picked,
 * makes the Workout with those exercises in pick order and opens it; closing the picker with
 * nothing makes no Workout at all, so an untouched empty one never exists. `withExercises` makes
 * one from exercises already chosen.
 */
export function useStartWorkout() {
  const router = useRouter();
  const pickExercises = usePickExercises("train");
  const { create } = useWorkoutActions();

  const withExercises = useCallback(
    async (exerciseIds: readonly string[]) => {
      const id = await create(exerciseIds);
      if (id) router.push({ pathname: "/train/workout/[id]", params: { id } });
      return id;
    },
    [create, router],
  );
  const fromPicker = useCallback(async () => {
    const picked = await pickExercises();
    if (picked && picked.length > 0) await withExercises(picked);
  }, [pickExercises, withExercises]);

  return { fromPicker, withExercises };
}
