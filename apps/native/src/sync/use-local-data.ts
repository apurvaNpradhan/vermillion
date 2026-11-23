import { useEffect, useState } from "react";

import { openLocalData, type LocalData } from "@/platform/local-database";

// Once open, every later mount reads the database on its first render: no extra null render.
let opened: LocalData | null = null;

/** The local database and sync lifecycle once open; null while opening. */
export function useLocalData(): LocalData | null {
  const [local, setLocal] = useState<LocalData | null>(opened);
  useEffect(() => {
    if (opened) {
      setLocal(opened);
      return;
    }
    let current = true;
    void openLocalData().then((value) => {
      opened = value;
      if (current) setLocal(value);
    });
    return () => {
      current = false;
    };
  }, []);
  return local;
}
