import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { applyPreferencesPatch } from "@workspace/client/apply-preferences-patch";
import {
  DEFAULT_UI_PREFERENCES,
  type Locale,
  type Preferences,
  type UpdatePreferences,
} from "@workspace/shared";
import type { i18n as I18n } from "i18next";
import { useEffect } from "react";

import { resolveDeviceLocale, useLocale, useTranslation } from "@/platform/i18n";
import { orpc } from "@/platform/orpc";

const EMPTY: Preferences = { locale: null, timezone: null, ui: DEFAULT_UI_PREFERENCES };

export function preferencesQueryOptions() {
  return orpc.preferences.get.queryOptions();
}

/**
 * Account language for the signed-in app: saved preference, else this device's
 * choice, else the phone's language. Run when the session appears so the app
 * switches to the language that follows the account.
 */
export async function applyAccountLocale({
  queryClient,
  i18n,
}: {
  queryClient: QueryClient;
  i18n: I18n;
}) {
  const saved = await queryClient.ensureQueryData(preferencesQueryOptions());
  const locale = resolveDeviceLocale(saved.locale);
  if (i18n.language !== locale) await i18n.changeLanguage(locale);
}

/** Saves a partial update, showing it at once and rolling back if the server refuses. */
function useUpdatePreferences() {
  const queryClient = useQueryClient();
  const key = orpc.preferences.get.queryKey();
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
        queryClient.setQueryData(key, saved);
      },
    }),
  );
}

/** The one hook every component uses to read and change the user's preferences. */
export function usePreferences() {
  const query = useQuery(preferencesQueryOptions());
  const update = useUpdatePreferences();
  const { setDeviceLocale } = useLocale();

  return {
    preferences: query.data ?? EMPTY,
    isLoading: query.isPending,
    isSaving: update.isPending,
    /** Account language, remembered on this device too. `null` follows the phone again. */
    setLocale: (locale: Locale | null) => {
      setDeviceLocale(locale);
      update.mutate({ locale });
    },
    setTimezone: (timezone: string | null) => update.mutate({ timezone }),
  };
}

/** Applies the account language when the signed-in app opens. */
export function useAccountLocale() {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const { data: user } = useQuery(orpc.account.me.queryOptions());
  const userId = user?.id;
  useEffect(() => {
    if (userId) void applyAccountLocale({ queryClient, i18n });
  }, [userId, queryClient, i18n]);
}
