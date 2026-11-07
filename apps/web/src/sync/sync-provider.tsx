import { useEffect, type ReactNode } from "react";

import { useSession } from "@/auth";

import { useLocalData } from "./use-local-data";

/**
 * Tells the sync lifecycle who is signed in. A failed session lookup (offline) says nothing:
 * only an answer, including "nobody", is passed on, so being offline never locks the device.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const local = useLocalData();
  const { session, isPending, isError } = useSession();
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (local?.status !== "ready" || isPending || isError) return;
    void local.lifecycle.sessionChanged(userId).catch(() => undefined);
  }, [local, isPending, isError, userId]);
  return children;
}
