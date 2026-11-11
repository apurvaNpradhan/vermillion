import { readProgramPlan, readWorkoutDetail, type WorkoutDetail } from "@workspace/sync";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useCallback, useMemo } from "react";
import { Share } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useLocalData } from "@/sync";

import { displayTitle } from "./derived-title";
import {
  planAsText,
  type PlanTextLabels,
  type SharedPlan,
  type SharedWorkout,
} from "./plan-as-text";
import { useSummaryLabels } from "./use-summary-labels";
import { useTrainingPreferences } from "./use-training-preferences";

const FALLBACK_TYPE = "weight_reps";

/**
 * "Share as text" for a Workout or a Program: reads the plan from the local database, writes it
 * with the user's weight unit and effort scale, and opens the system share sheet. Resolves once
 * the sheet closes; a failure shows a toast.
 */
export function useSharePlan() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const { weightUnit, effortScale } = useTrainingPreferences();
  const summary = useSummaryLabels();
  const labels = useMemo<PlanTextLabels>(
    () => ({
      ...summary,
      rest: (clock) => t("training__share_rest", { clock }),
      at: (weight) => t("training__share_at", { weight }),
      superset: t("training__superset"),
      slot: (number, title) => t("training__share_slot", { number, title }),
      restDay: (number) => t("training__share_rest_day", { number }),
    }),
    [summary, t],
  );

  const shared = useCallback(
    (workout: WorkoutDetail): SharedWorkout => ({
      title: displayTitle(
        workout.title,
        workout.exercises.flatMap((entry) =>
          entry.exercise ? [entry.exercise.primaryMuscle] : [],
        ),
        (key) => t(key),
      ),
      note: workout.note,
      exercises: workout.exercises.map((entry) => ({
        name: entry.exercise?.title ?? t("training__exercise_missing"),
        type: entry.exercise?.exerciseType ?? FALLBACK_TYPE,
        sets: entry.sets,
        restSeconds: entry.restSeconds,
        note: entry.note,
        supersetGroup: entry.supersetGroup,
      })),
    }),
    [t],
  );

  const send = useCallback(
    async (read: () => Promise<SharedPlan | null>, title: string) => {
      try {
        const plan = await read();
        if (plan === null) throw new Error("The plan is gone");
        const message = planAsText(plan, { weightUnit, effortScale }, labels);
        await Share.share({ message, title });
        return true;
      } catch {
        toast.show({ variant: "danger", label: t("training__share_failed") });
        return false;
      }
    },
    [weightUnit, effortScale, labels, toast, t],
  );

  const shareWorkout = useCallback(
    (workoutId: string, title: string) =>
      send(async () => {
        const workout = database ? await readWorkoutDetail(database, workoutId) : null;
        return workout ? { kind: "workout", workout: shared(workout) } : null;
      }, title),
    [database, send, shared],
  );

  const shareProgram = useCallback(
    (programId: string, title: string) =>
      send(async () => {
        const plan = database ? await readProgramPlan(database, programId) : null;
        if (!plan) return null;
        return {
          kind: "program",
          program: {
            title: plan.title,
            description: plan.description,
            slots: plan.slots.map((slot) => (slot.workout ? shared(slot.workout) : null)),
          },
        };
      }, title),
    [database, send, shared],
  );

  return { shareWorkout, shareProgram };
}
