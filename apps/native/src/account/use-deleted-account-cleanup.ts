import { useQueryClient } from "@tanstack/react-query";
import { clearSession } from "@workspace/client/session";
import { useEffect } from "react";

import { authClient } from "@/platform/auth-client";
import { confirmAccountDeleted } from "@/sync";

/** Deletion already revoked the server session; always discard local credentials and cached data. */
export function useDeletedAccountCleanup() {
  const queryClient = useQueryClient();
  useEffect(() => {
    void confirmAccountDeleted()
      .catch(() => undefined)
      .then(() => authClient.signOut())
      .catch(() => undefined)
      .finally(() => clearSession(queryClient));
  }, [queryClient]);
}
