import { useRouter } from "expo-router";
import { useCallback, useRef } from "react";

import { usePickExercises } from "@/exercise";

import { useWorkoutActions } from "./use-workout-actions";

/**
 * Starting a Workout. `fromPicker` opens the library in pick mode and, once something is picked,
 * makes the Workout with those exercises in pick order and opens it; closing the picker with
 * nothing makes no Workout at all, so an untouched empty one never exists. `withExercises` makes
 * one from exercises already chosen. Either takes the Program that should own the new Workout
 * (it then fills a new Slot at the end of its Rotation).
 */
export function useStartWorkout() {
  const router = useRouter();
  const pickExercises = usePickExercises("train");
  const { create } = useWorkoutActions();

  // A row inside a bottom sheet can fire twice on Android; one press makes one Workout.
  const creating = useRef(false);
  const withExercises = useCallback(
    async (exerciseIds: readonly string[], programId: string | null = null) => {
      if (creating.current) return null;
      creating.current = true;
      try {
        const id = await create(exerciseIds, programId);
        if (id) router.push({ pathname: "/train/workout/[id]", params: { id } });
        return id;
      } finally {
        creating.current = false;
      }
    },
    [create, router],
  );
  const fromPicker = useCallback(
    async (programId: string | null = null) => {
      const picked = await pickExercises();
      if (picked && picked.length > 0) await withExercises(picked, programId);
    },
    [pickExercises, withExercises],
  );

  return { fromPicker, withExercises };
}
