import { retiredExerciseIds } from "@workspace/sync";
import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native";
import { Plus, X } from "phosphor-react-native";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useLocalData } from "@/sync";
import { useHideTabBar } from "@/platform/navigation/tab-action";
import { Button } from "@/platform/ui/button";

import { ExerciseLibrary } from "../../library/components/exercise-library";
import { selectionOrder } from "../pick-selection";
import { cancelPick, clearPick, finishPick, getPickSession, togglePick } from "../pick-session";
import { usePickSession } from "../use-pick-session";
import { PickSwapSuggestions } from "./pick-swap-suggestions";

/** Height of the selection bar above the bottom inset, in points. */
const BAR_HEIGHT = 72;

/**
 * The exercise library in pick mode, shown as a sheet: tap rows to select them (numbered in the
 * order picked), then "Add N" returns the ids to whoever opened it. Closing the sheet answers
 * with nothing. A session that no longer exists (a restored app, a deep link) just closes.
 */
export function ExercisePickScreen({
  requestId,
  onCreate,
  closeFallback = "/exercises",
}: {
  requestId: string;
  /** Where closing goes when there is nothing to go back to. */
  closeFallback?: "/exercises" | "/train" | "/";
  /** Open the new-exercise form for this request, prefilled with the searched title. */
  onCreate: (title: string) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  const session = usePickSession(requestId);
  useHideTabBar(true);

  // Whatever way the sheet goes away (close button, swipe, account reset), the caller is answered.
  const answered = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Development re-runs effects right away; only a screen still gone a tick later is closed.
      queueMicrotask(() => {
        if (!mounted.current) cancelPick(requestId);
      });
    };
  }, [requestId]);
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(closeFallback);
  }, [router, closeFallback]);
  useEffect(() => {
    if (session === null && !answered.current) close();
  }, [session, close]);

  const selected = session?.selected ?? [];
  const order = useMemo(() => selectionOrder(selected), [selected]);
  const onToggle = useCallback(
    (id: string) => {
      togglePick(requestId, id);
      haptic.tick();
    },
    [requestId],
  );
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const add = useCallback(async () => {
    answered.current = true;
    haptic.confirm();
    // An exercise archived on another device while the picker was open is not handed back.
    const picked = getPickSession(requestId)?.selected ?? [];
    const retired = database
      ? await retiredExerciseIds(database, picked).catch(() => new Set<string>())
      : new Set<string>();
    finishPick(requestId, retired);
    close();
  }, [requestId, close, database]);

  return (
    <View className="flex-1 bg-background">
      <ExerciseLibrary
        mode="pick"
        title={t("exercise__pick_title")}
        selectedOrder={order}
        disabledIds={session?.options.exclude}
        listHeader={
          session?.options.swapFor ? (
            <PickSwapSuggestions
              exerciseId={session.options.swapFor}
              selected={selected}
              onToggle={onToggle}
            />
          ) : null
        }
        bottomInset={bottom + BAR_HEIGHT - 24}
        onToggle={onToggle}
        onCreate={onCreate}
        headerActions={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("exercise__new")}
              onPress={() => onCreate("")}
              className="h-11 w-11 items-center justify-center"
            >
              <Plus size={20} weight="bold" color={foreground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common__close")}
              onPress={close}
              className="h-11 w-11 items-center justify-center"
            >
              <X size={20} weight="bold" color={foreground} />
            </Pressable>
          </>
        }
      />
      <View
        className="absolute inset-x-0 bottom-0 flex-row items-center gap-3 border-t border-separator bg-background px-4 pt-3"
        style={{ paddingBottom: bottom + 12, minHeight: BAR_HEIGHT + bottom }}
      >
        <Button
          variant="secondary"
          isDisabled={selected.length === 0}
          onPress={() => clearPick(requestId)}
        >
          <Button.Label>{t("exercise__pick_clear")}</Button.Label>
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          isDisabled={selected.length === 0}
          onPress={add}
        >
          <Button.Label>{t("exercise__pick_add", { count: selected.length })}</Button.Label>
        </Button>
      </View>
    </View>
  );
}
