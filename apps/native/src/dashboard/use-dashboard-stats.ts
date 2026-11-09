import { useExerciseCount } from "@/exercise";
import { useSyncStatus } from "@/sync";

/**
 * The numbers on Home, live from the local database: how many exercises the device holds and how
 * many changes still wait to upload. Both read 0 until the first answer.
 */
export function useDashboardStats() {
  const exercises = useExerciseCount();
  const { snapshot } = useSyncStatus();
  return { exercises: exercises ?? 0, pendingChanges: snapshot?.pendingCount ?? 0 };
}
