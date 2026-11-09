import { Fragment, useEffect, type ReactNode } from "react";

import { useSession } from "@/auth";

import { useLocalData } from "./use-local-data";
import { useSyncStatus } from "./use-sync-status";

/**
 * Tells the sync lifecycle who is signed in. A failed session lookup (offline) says nothing:
 * only an answer, including "nobody", is passed on, so being offline never locks the device.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const local = useLocalData();
  const { snapshot } = useSyncStatus();
  const { session, isPending, isError } = useSession();
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (local?.status !== "ready" || isPending || isError) return;
    void local.lifecycle.sessionChanged(userId).catch(() => undefined);
  }, [local, isPending, isError, userId]);
  // Reset form state on this tab too, including resets initiated in another tab. Store-level
  // scope checks reject callbacks already in flight before React observes the new identity.
  return <Fragment key={snapshot?.writeScope ?? "unclaimed"}>{children}</Fragment>;
}
