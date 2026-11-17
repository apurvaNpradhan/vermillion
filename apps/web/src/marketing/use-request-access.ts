import { useMutation, useQuery } from "@tanstack/react-query";

import { getRpc } from "@/platform/orpc";

/** The request-access form's one action; the answer is the same whatever the address. */
export function useRequestAccess() {
  const mutation = useMutation({
    mutationFn: (input: { email: string; turnstileToken?: string }) =>
      getRpc().client.access.request(input),
    meta: { silent: true },
  });
  return {
    request: mutation.mutateAsync,
    pending: mutation.isPending,
    sent: mutation.isSuccess,
    error: mutation.error,
  };
}

/** What an invite link's token says (the address and whether it still works). */
export function useInviteLink(token: string | undefined) {
  const query = useQuery({
    queryKey: ["access", "invite", token],
    queryFn: () => getRpc().client.access.invite({ token: token ?? "" }),
    enabled: Boolean(token),
    retry: false,
    meta: { silent: true },
  });
  return { invite: query.data ?? null, loading: query.isLoading, failed: query.isError };
}
