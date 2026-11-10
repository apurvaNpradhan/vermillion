import { readInstallId } from "@workspace/sync";
import { useEffect, useState } from "react";

import { useLocalData } from "@/sync";

/** This device's install id, which marks the Session it owns; null until the database is open. */
export function useInstallId(): string | null {
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
  return installId;
}
