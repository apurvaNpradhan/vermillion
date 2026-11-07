import { ORPCError } from "@orpc/client";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

export type QueryClientHandlers = {
  /** Called for every failed query or mutation (not for ones that opt out with `meta.silent`). */
  onError: (error: Error) => void;
};

/** One client per request on the server, one per tab in the browser. */
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
        if (!query.meta?.silent) onError(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (!mutation.meta?.silent) onError(error);
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
