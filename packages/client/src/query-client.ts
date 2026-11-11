import { ORPCError } from "@orpc/client";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { isNetworkError } from "./network-error";

export type QueryClientHandlers = {
  /**
   * Called for every failed query or mutation, except ones that opt out with `meta.silent` and
   * network failures: being offline is shown by the connectivity pill, never as an error.
   */
  onError: (error: Error) => void;
};

/** One client per app start. */
export function createQueryClient({ onError }: QueryClientHandlers) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // API errors are answers, not blips: only retry network failures.
        retry: (failures, error) => failures < 2 && !(error instanceof ORPCError),
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!query.meta?.silent && !isNetworkError(error)) onError(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (!mutation.meta?.silent && !isNetworkError(error)) onError(error);
      },
    }),
  });
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { silent?: boolean };
    mutationMeta: { silent?: boolean };
  }
}
