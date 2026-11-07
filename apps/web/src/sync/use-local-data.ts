import { useEffect, useState } from "react";

import { openLocalData, type LocalData } from "@/platform/powersync";

/** The local database and sync lifecycle once open; null while opening (and on the server). */
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
