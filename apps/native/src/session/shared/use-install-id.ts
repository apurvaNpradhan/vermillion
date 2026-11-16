import { readInstallId } from "@workspace/sync";
import { useEffect, useState } from "react";

import { useLocalData, useSyncValue } from "@/sync";

/**
 * This device's install id, which marks the Session it owns; null until the database is open.
 * Sync's write scope is the install id once sync has started, so a screen usually has it on its
 * first render; before that it is read from the database.
 */
export function useInstallId(): string | null {
  const writeScope = useSyncValue((snapshot) => snapshot?.writeScope ?? null);
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const [installId, setInstallId] = useState<string | null>(null);
  useEffect(() => {
    if (!database) return;
    let current = true;
    void readInstallId(database).then((id) => {
      if (current) setInstallId(id);
    });
    return () => {
      current = false;
    };
  }, [database]);
  return writeScope ?? installId;
}
