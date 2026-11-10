import { useRouter } from "expo-router";
import { useCallback } from "react";

import type { PickOptions } from "./pick-selection";
import { openPickSession } from "./pick-session";

/**
 * Opens the exercise picker over the current screen and resolves with the chosen exercise ids in
 * the order picked, or `null` when the user closes it (or the account is reset) without adding.
 *
 * `tab` is the tab whose stack shows the picker, so closing it returns to the screen that asked.
 * `max` limits how many can be chosen (1 = replace: tapping another swaps); `exclude` lists
 * exercises already in the workout, which cannot be picked. The route carries only a request id;
 * the selection and the promise live in the pick session store.
 *
 * ```ts
 * const pickExercises = usePickExercises();
 * const ids = await pickExercises({ exclude: workoutExerciseIds });
 * if (ids) addToWorkout(ids);
 * ```
 */
export function usePickExercises(tab: "exercises" | "train" = "exercises") {
  const router = useRouter();
  return useCallback(
    (options: PickOptions = {}): Promise<string[] | null> => {
      const { id, result } = openPickSession(options);
      router.push({
        pathname: tab === "train" ? "/train/pick" : "/exercises/pick",
        params: { request: id },
      });
      return result;
    },
    [router, tab],
  );
}
