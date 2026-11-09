import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/platform/auth-client";

import { PasskeyListSchema, toPasskeyRows } from "./passkey-logic";

export const PASSKEYS_QUERY_KEY = ["auth", "passkeys"] as const;

/** The signed-in account's passkeys, with rename and delete. */
export function usePasskeys() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: PASSKEYS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await authClient.$fetch("/passkey/list-user-passkeys", {
        method: "GET",
      });
      const parsed = PasskeyListSchema.safeParse(data);
      if (error || !parsed.success) throw new Error("Could not load passkeys");
      return toPasskeyRows(parsed.data);
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: PASSKEYS_QUERY_KEY });
  const rename = useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const { error } = await authClient.$fetch("/passkey/update-passkey", {
        method: "POST",
        body: input,
      });
      if (error) throw new Error("Could not rename the passkey");
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await authClient.$fetch("/passkey/delete-passkey", {
        method: "POST",
        body: { id },
      });
      if (error) throw new Error("Could not delete the passkey");
    },
    onSuccess: refresh,
  });
  return {
    passkeys: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    reload: query.refetch,
    rename: rename.mutateAsync,
    remove: remove.mutateAsync,
  };
}
