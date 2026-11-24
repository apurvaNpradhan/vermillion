import { useEffect, useState } from "react";

import { getOpenedLocalData, openLocalData, type LocalData } from "@/platform/local-database";

/** The local database and sync lifecycle once open; null while opening. */
export function useLocalData(): LocalData | null {
  const [local, setLocal] = useState(getOpenedLocalData);
  useEffect(() => {
    if (local) return;
    let current = true;
    void openLocalData().then((value) => {
      if (current) setLocal(value);
    });
    return () => {
      current = false;
    };
  }, [local]);
  return local;
}
