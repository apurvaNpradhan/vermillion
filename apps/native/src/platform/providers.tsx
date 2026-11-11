import { QueryClientProvider } from "@tanstack/react-query";
import { SESSION_QUERY_KEY, clearSession } from "@workspace/client/session";
import { errorMessage } from "@workspace/client/error-message";
import { isUnauthorized } from "@workspace/client/orpc-error";
import { createQueryClient } from "@workspace/client/query-client";
import { HeroUINativeProvider } from "heroui-native";
import { useRef, useState, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { SyncProvider } from "@/sync";

import { I18nextProvider, i18n } from "./i18n";
import { TAB_BAR_GAP, TAB_BAR_HEIGHT } from "./navigation/tab-bar-metrics";
import { NavigationTheme } from "./theme/navigation-theme";
import { LocalDataResetNotice } from "./local-database/local-data-reset-notice";
import { useAppToast } from "./ui/use-app-toast";

/**
 * Query client whose failures surface as toasts; a lost session just clears the cached user.
 * Network failures never reach `onError` (the client drops them): offline has its own pill.
 */
function QueryProvider({ children }: { children: ReactNode }) {
  const { toast } = useAppToast();
  // The client lives for the app's life, so it reads the current toast API, never the first one
  // (HeroUI's `hide` closes over the toasts of the render it came from).
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [queryClient] = useState(() => {
    const client = createQueryClient({
      onError: (error) => {
        if (isUnauthorized(error)) {
          // The session is gone: drop it and all cached user data. A device with an owner keeps its
          // local data (sign-in banner); any other shows sign-in. Further 401s change nothing.
          if (client.getQueryData(SESSION_QUERY_KEY) !== null) void clearSession(client);
          return;
        }
        toastRef.current.show({ variant: "danger", label: errorMessage(i18n.t, error) });
      },
    });
    return client;
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// Toasts sit at the bottom, in thumb reach and clear of the header, floating just above the tab
// bar (its height plus gap, on top of the safe area HeroUI already adds).
const HEROUI_CONFIG = {
  toast: {
    defaultProps: { placement: "bottom" },
    insets: { bottom: TAB_BAR_HEIGHT + TAB_BAR_GAP + 32, left: 16, right: 16 },
  },
} as const;

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <HeroUINativeProvider config={HEROUI_CONFIG}>
            <NavigationTheme>
              <QueryProvider>
                <SyncProvider>
                  {children}
                  <LocalDataResetNotice />
                </SyncProvider>
              </QueryProvider>
            </NavigationTheme>
          </HeroUINativeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </I18nextProvider>
  );
}
