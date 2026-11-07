import type { StorageUnavailableReason } from "@workspace/sync";
import { useEffect, useState } from "react";

import { isStoragePersisted, openWebDatabase } from "@/platform/powersync";

export type DiagnosticsState =
  | { status: "loading" }
  | { status: "unavailable"; reason: StorageUnavailableReason }
  | { status: "ready"; installId: string; persisted: boolean };

/** Minimal local-storage diagnostics: is the database open, which install is it, is it persistent. */
export function useDiagnostics(): DiagnosticsState {
  const [state, setState] = useState<DiagnosticsState>({ status: "loading" });
  useEffect(() => {
    let current = true;
    void (async () => {
      const result = await openWebDatabase();
      if (!current) return;
      if (result.status === "unavailable") {
        setState({ status: "unavailable", reason: result.reason });
        return;
      }
      const row = await result.database.get<{ install_id: string }>(
        "SELECT install_id FROM install_meta",
      );
      const persisted = await isStoragePersisted();
      if (current) setState({ status: "ready", installId: row.install_id, persisted });
    })();
    return () => {
      current = false;
    };
  }, []);
  return state;
}
