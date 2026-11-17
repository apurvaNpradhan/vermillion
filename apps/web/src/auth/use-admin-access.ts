import { useQuery, useQueryClient } from "@tanstack/react-query";
import { errorCode } from "@workspace/client/orpc-error";
import { useCallback } from "react";

import { getAuthClient } from "@/platform/auth-client";
import { getRpc } from "@/platform/orpc";

import { adminGate, type AdminGateInput } from "./admin-gate";

const SESSION_KEY = ["admin", "session"];
const ENROLMENT_KEY = ["admin", "enrolment"];

/** The session and the admin's two-factor standing, as one gate decision. */
export function useAdminAccess() {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => (await getAuthClient().getSession()).data ?? null,
    meta: { silent: true },
  });
  const signedIn = Boolean(session.data);
  const enrolment = useQuery({
    queryKey: [...ENROLMENT_KEY, session.data?.session.id],
    queryFn: () => getRpc().client.admin.enrolment.status(),
    enabled: signedIn,
    retry: false,
    meta: { silent: true },
  });
  const state: AdminGateInput["enrolment"] = enrolment.data
    ? { state: "known", ...enrolment.data }
    : enrolment.error
      ? errorCode(enrolment.error) === "NOT_FOUND"
        ? { state: "denied" }
        : { state: "error" }
      : { state: "loading" };
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin"] });
  }, [queryClient]);
  const signOut = useCallback(async () => {
    await getAuthClient().signOut();
    queryClient.clear();
    await refresh();
  }, [queryClient, refresh]);
  return {
    gate: adminGate({ sessionLoading: session.isLoading, signedIn, enrolment: state }),
    email: session.data?.user.email ?? null,
    refresh,
    signOut,
  };
}
