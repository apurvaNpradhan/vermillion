import { useCallback, useEffect, useState } from "react";

import { whenWritesIdle } from "./write-gate";

export type OfflineUpdate = {
  /** A new worker is installed and waiting. */
  ready: boolean;
  /** The user accepted; waiting for in-flight writes to finish before activating. */
  waiting: boolean;
  apply: () => void;
  dismiss: () => void;
};

/**
 * Registers the offline shell worker (production builds only) and reports a waiting update. The
 * new worker is activated only when the user accepts and no tracked write is in flight, and only
 * this tab reloads afterwards.
 */
export function useOfflineUpdate(): OfflineUpdate {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [ready, setReady] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!__OFFLINE_SHELL__ || !("serviceWorker" in navigator)) return;
    let current = true;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (!current) return;
        setRegistration(reg);
        // Only an update is announced: the first install has no controller yet.
        const announce = () => {
          if (reg.waiting && navigator.serviceWorker.controller) setReady(true);
        };
        announce();
        reg.addEventListener("updatefound", () => {
          reg.installing?.addEventListener("statechange", announce);
        });
      })
      .catch(() => {
        // Without a worker the app still works online; nothing to report.
      });
    return () => {
      current = false;
    };
  }, []);

  const apply = useCallback(() => {
    const worker = registration?.waiting;
    if (!worker) return;
    setWaiting(true);
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
      once: true,
    });
    void whenWritesIdle().then(() => worker.postMessage("SKIP_WAITING"));
  }, [registration]);

  const dismiss = useCallback(() => setReady(false), []);

  return { ready, waiting, apply, dismiss };
}
