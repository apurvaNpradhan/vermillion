import { createRouter } from "@tanstack/react-router";
import { createI18n } from "@workspace/i18n";
import { toastManager } from "@workspace/ui/components/toast";

import { clearSession } from "@workspace/client/session";
import { errorMessage } from "@workspace/client/error-message";
import { isUnauthorized } from "@workspace/client/orpc-error";
import { createQueryClient } from "@workspace/client/query-client";
import { resolveDeviceLocale } from "./platform/i18n";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // Created per router: on the server that is once per request, so languages never leak between visitors.
  // The visitor's language is known from the cookie or Accept-Language before anything renders.
  const i18n = createI18n(resolveDeviceLocale());

  const queryClient = createQueryClient({
    onError: (error) => {
      if (isUnauthorized(error)) {
        // The session is gone: drop it and all cached user data, and let the guard send the user to sign-in.
        void clearSession(queryClient).then(() => router.invalidate());
        return;
      }
      toastManager.add({ type: "error", title: errorMessage(i18n.t, error) });
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient, i18n },
    defaultPreload: "intent",
    // Let TanStack Query decide whether cached data is fresh enough.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
