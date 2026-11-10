import { useRouter } from "expo-router";
import { useCallback } from "react";

import type { PickOptions } from "./pick-selection";
import { hasOpenPickSession, openPickSession } from "./pick-session";

/**
 * Opens the exercise picker over the current screen and resolves with the chosen exercise ids in
 * the order picked, or `null` when the user closes it (or the account is reset) without adding.
 *
 * `tab` is the stack that shows the picker (a tab, or the Session screen), so closing it returns to
 * the screen that asked.
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
export function usePickExercises(tab: "exercises" | "train" | "session" = "exercises") {
  const router = useRouter();
  return useCallback(
    (options: PickOptions = {}): Promise<string[] | null> => {
      // One picker at a time: a repeated press answers the extra caller with nothing.
      if (hasOpenPickSession()) return Promise.resolve(null);
      const { id, result } = openPickSession(options);
      router.push({
        pathname:
          tab === "train" ? "/train/pick" : tab === "session" ? "/session/pick" : "/exercises/pick",
        params: { request: id },
      });
      return result;
    },
    [router, tab],
  );
}
