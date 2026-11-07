import { useEffect, useState } from "react";

import { openLocalData, type LocalData } from "@/platform/local-database";

/** The local database and sync lifecycle once open; null while opening. */
export function useLocalData(): LocalData | null {
  const [local, setLocal] = useState<LocalData | null>(null);
  useEffect(() => {
    let current = true;
    void openLocalData().then((opened) => {
      if (current) setLocal(opened);
    });
    return () => {
      current = false;
    };
  }, []);
  return local;
}
