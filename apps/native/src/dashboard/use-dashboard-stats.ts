import { useNotesCount } from "@/notes";
import { useSyncStatus } from "@/sync";

/**
 * The numbers on Home, live from the local database: how many notes the device holds and how
 * many changes still wait to upload. Both read 0 until the first answer.
 */
export function useDashboardStats() {
  const notes = useNotesCount();
  const { snapshot } = useSyncStatus();
  return { notes: notes ?? 0, pendingChanges: snapshot?.pendingCount ?? 0 };
}
