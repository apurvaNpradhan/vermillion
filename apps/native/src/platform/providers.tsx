import { QueryClientProvider } from "@tanstack/react-query";
import { SESSION_QUERY_KEY, clearSession } from "@workspace/client/session";
import { errorMessage } from "@workspace/client/error-message";
import { isUnauthorized } from "@workspace/client/orpc-error";
import { createQueryClient } from "@workspace/client/query-client";
import { HeroUINativeProvider, useToast } from "heroui-native";
import { useState, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { SyncProvider } from "@/sync";

import { I18nextProvider, i18n } from "./i18n";
import { LocalDataResetNotice } from "./local-database/local-data-reset-notice";

/** Query client whose failures surface as toasts; a lost session just clears the cached user. */
function QueryProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [queryClient] = useState(() => {
    const client = createQueryClient({
      onError: (error) => {
        if (isUnauthorized(error)) {
          // The session is gone: drop it and all cached user data. A device with an owner keeps its
          // local data (sign-in banner); any other shows sign-in. Further 401s change nothing.
          if (client.getQueryData(SESSION_QUERY_KEY) !== null) void clearSession(client);
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
            <QueryProvider>
              <SyncProvider>
                {children}
                <LocalDataResetNotice />
              </SyncProvider>
            </QueryProvider>
          </HeroUINativeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </I18nextProvider>
  );
}
