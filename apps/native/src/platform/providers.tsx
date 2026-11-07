import { QueryClientProvider } from "@tanstack/react-query";
import { clearSession } from "@workspace/client/session";
import { errorMessage } from "@workspace/client/error-message";
import { isUnauthorized } from "@workspace/client/orpc-error";
import { createQueryClient } from "@workspace/client/query-client";
import { HeroUINativeProvider, useToast } from "heroui-native";
import { useState, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { I18nextProvider, i18n } from "./i18n";

/** Query client whose failures surface as toasts; a lost session just clears the cached user. */
function QueryProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [queryClient] = useState(() => {
    const client = createQueryClient({
      onError: (error) => {
        if (isUnauthorized(error)) {
          // The session is gone: drop it and all user data, and let the route guard show sign-in.
          void clearSession(client);
          return;
        }
        toast.show({ variant: "danger", label: errorMessage(i18n.t, error) });
      },
    });
    return client;
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <HeroUINativeProvider>
            <QueryProvider>{children}</QueryProvider>
          </HeroUINativeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </I18nextProvider>
  );
}
