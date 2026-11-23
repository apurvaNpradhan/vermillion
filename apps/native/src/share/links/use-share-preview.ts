import { useQuery } from "@tanstack/react-query";
import { isNetworkError } from "@workspace/client/network-error";
import { errorCode } from "@workspace/client/orpc-error";
import type { ShareSnapshot } from "@workspace/shared";

import { orpc } from "@/platform/orpc";

export type SharePreview =
  | { status: "loading" }
  | { status: "found"; snapshot: ShareSnapshot }
  | { status: "missing" | "gone" | "offline" | "error"; retry: () => void };

/** The snapshot behind a code, read from the public endpoint, with every failure as a state. */
export function useSharePreview(code: string): SharePreview {
  const query = useQuery(
    orpc.share.get.queryOptions({ input: { code }, meta: { silent: true }, retry: false }),
  );
  const retry = () => void query.refetch();
  if (query.data) return { status: "found", snapshot: query.data.snapshot };
  if (query.isError) {
    if (isNetworkError(query.error)) return { status: "offline", retry };
    const failure = errorCode(query.error);
    if (failure === "GONE") return { status: "gone", retry };
    if (failure === "NOT_FOUND") return { status: "missing", retry };
    return { status: "error", retry };
  }
  return { status: "loading" };
}
