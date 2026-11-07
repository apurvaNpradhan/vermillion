import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/platform/orpc";

/** Whether sign-up is open and which social providers the server has configured. */
export function useRegistrationStatus() {
  const query = useQuery(orpc.auth.registrationStatus.queryOptions({ meta: { silent: true } }));
  return query.data ?? null;
}
