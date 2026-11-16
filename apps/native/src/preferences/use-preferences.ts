import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { applyPreferencesPatch } from "@workspace/client/apply-preferences-patch";
import {
  DEFAULT_UI_PREFERENCES,
  type Locale,
  type Preferences,
  type UiPreferencesPatch,
  type UpdatePreferences,
} from "@workspace/shared";
import type { i18n as I18n } from "i18next";
import { AppState } from "react-native";
import { useSession } from "@/auth";
import { useSyncValue } from "@/sync";
import { client } from "@/platform/orpc";
import {
  clearPreferencesCache,
  readPreferencesCache,
  writePreferencesCache,
} from "@/platform/preferences-cache";
import { useEffect } from "react";

import { resolveDeviceLocale, useLocale, useTranslation } from "@/platform/i18n";
import { orpc } from "@/platform/orpc";

const EMPTY: Preferences = { locale: null, timezone: null, ui: DEFAULT_UI_PREFERENCES };

export function preferencesQueryOptions(userId: string) {
  return queryOptions({
    queryKey: [...orpc.preferences.get.queryKey(), userId],
    enabled: userId !== "",
    initialData: () => readPreferencesCache(userId),
    queryFn: async () => {
      const saved = await client.preferences.get();
      writePreferencesCache(userId, saved);
      return saved;
    },
  });
}

/**
 * Account language for the signed-in app: saved preference, else this device's
 * choice, else the phone's language. Run when the session appears so the app
 * switches to the language that follows the account.
 */
export async function applyAccountLocale({
  queryClient,
  i18n,
  userId,
}: {
  queryClient: QueryClient;
  i18n: I18n;
  userId: string;
}) {
  const saved = await queryClient.ensureQueryData(preferencesQueryOptions(userId));
  const locale = resolveDeviceLocale(saved.locale);
  if (i18n.language !== locale) await i18n.changeLanguage(locale);
}

/** Saves a partial update, showing it at once and rolling back if the server refuses. */
function useUpdatePreferences(userId: string) {
  const queryClient = useQueryClient();
  const key = preferencesQueryOptions(userId).queryKey;
  return useMutation(
    orpc.preferences.update.mutationOptions({
      onMutate: async (patch: UpdatePreferences) => {
        await queryClient.cancelQueries({ queryKey: key });
        const previous = queryClient.getQueryData(key);
        if (previous) queryClient.setQueryData(key, applyPreferencesPatch(previous, patch));
        return { previous };
      },
      onError: (_error, _patch, context) => {
        if (context?.previous) queryClient.setQueryData(key, context.previous);
      },
      onSuccess: (saved) => {
        writePreferencesCache(userId, saved);
        queryClient.setQueryData(key, saved);
      },
    }),
  );
}

/** The one hook every component uses to read and change the user's preferences. */
export function usePreferences() {
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const query = useQuery(preferencesQueryOptions(userId));
  const update = useUpdatePreferences(userId);
  const queryClient = useQueryClient();
  const { setDeviceLocale } = useLocale();

  return {
    preferences: query.data ?? EMPTY,
    refresh: () => queryClient.fetchQuery({ ...preferencesQueryOptions(userId), staleTime: 0 }),
    isLoading: query.isPending,
    hasPreferences: query.data !== undefined,
    isSaving: update.isPending,
    /** Account language, remembered on this device too. `null` follows the phone again. */
    setLocale: (locale: Locale | null) => {
      setDeviceLocale(locale);
      update.mutate({ locale });
    },
    setTimezone: (timezone: string | null) => update.mutate({ timezone }),
    /** Saves some of the `ui` preferences (weight unit, effort scale, default rest). */
    setUiAsync: (ui: UiPreferencesPatch) => update.mutateAsync({ ui }),
    setUi: (ui: UiPreferencesPatch) => update.mutate({ ui }),
  };
}

/** Applies the account language when the signed-in app opens. */
export function useAccountLocale() {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const { data: user } = useQuery(orpc.account.me.queryOptions());
  const userId = user?.id;
  const connected = useSyncValue((s) => s?.indicator === "connected");
  useEffect(() => {
    if (userId && connected)
      void queryClient.invalidateQueries({ queryKey: preferencesQueryOptions(userId).queryKey });
  }, [connected, userId, queryClient]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active" && userId)
        void queryClient.invalidateQueries({ queryKey: preferencesQueryOptions(userId).queryKey });
    });
    return () => listener.remove();
  }, [userId, queryClient]);
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (
          event.query.queryKey[0] === "auth" &&
          event.query.queryKey[1] === "session" &&
          event.query.state.data === null
        )
          clearPreferencesCache();
      }),
    [queryClient],
  );
  useEffect(() => {
    if (userId) void applyAccountLocale({ queryClient, i18n, userId }).catch(() => undefined);
  }, [userId, queryClient, i18n]);
}
