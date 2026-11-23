import { useQuery } from "@tanstack/react-query";
import { isNetworkError } from "@workspace/client/network-error";
import { errorCode } from "@workspace/client/orpc-error";
import type { ShareSnapshot } from "@workspace/shared";

import { orpc } from "@/platform/orpc";

export type SharePreview =
  | { status: "loading" }
  | {
      status: "found";
      snapshot: ShareSnapshot;
      /** Asks the server again; false when the link was turned off or removed meanwhile. */
      recheck: () => Promise<boolean>;
    }
  | { status: "missing" | "gone" | "offline" | "error"; retry: () => void };

const refused = (error: Error | null) => {
  const failure = errorCode(error);
  return failure === "GONE" || failure === "NOT_FOUND";
};

/**
 * The snapshot behind a code, read from the public endpoint, with every failure as a state. A link
 * can be turned off at any time, so it is read afresh on every mount (never from the cache), and
 * a GONE or NOT_FOUND answer wins over any snapshot already held.
 */
export function useSharePreview(code: string): SharePreview {
  const query = useQuery(
    orpc.share.get.queryOptions({
      input: { code },
      meta: { silent: true },
      retry: false,
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: "always",
    }),
  );
  const retry = () => void query.refetch();
  if (query.isError && !isNetworkError(query.error)) {
    if (errorCode(query.error) === "GONE") return { status: "gone", retry };
    if (errorCode(query.error) === "NOT_FOUND") return { status: "missing", retry };
  }
  if (query.data) {
    const recheck = async () => {
      const result = await query.refetch();
      return !(result.isError && refused(result.error));
    };
    return { status: "found", snapshot: query.data.snapshot, recheck };
  }
  if (query.isError) {
    return isNetworkError(query.error) ? { status: "offline", retry } : { status: "error", retry };
  }
  return { status: "loading" };
}
