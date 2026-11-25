import { SLOT_STATE_KEYS, stripState } from "@/training/train/strip-state";
import { useRouter } from "expo-router";
import { Check, Repeat } from "phosphor-react-native";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { SectionHeader } from "@/platform/ui/section-header";
import { useStartSession } from "@/session";
import type { useActiveProgram } from "@/training/programs/use-active-program";
import { slotTitle } from "@/training/rotation/rotation-row";
import { ProgramTile } from "@/training/programs/program-row";

export function ActiveProgramCard({
  state,
}: {
  /** Read by the screen, so the card appears together with the rest of it. */
  state: ReturnType<typeof useActiveProgram>;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { program, run, progress, week, totalWeeks, paused } = state;
  const { startSlot, sheet } = useStartSession();
  if (!program || !run) return null;
  const next = program.slots.find((s) => s.id === progress.next?.id);
  const position = next ? program.slots.findIndex((slot) => slot.id === next.id) + 1 : 0;
  const progressText = totalWeeks
    ? t("run__progress_of", { week, total: totalWeeks, workout: position })
    : t("run__progress", { week, workout: position });
  return (
    <View className="gap-3">
      <SectionHeader
        title={t("run__active")}
        actionLabel={t("run__change")}
        onAction={() => router.push("/train/programs")}
      />
      <View className="flex-row items-center gap-3">
        <ProgramTile title={program.title} size={40} coverMediaId={program.coverMediaId} />
        <View className="flex-1">
          <Text numberOfLines={1} className="font-semibold text-body text-foreground">
            {program.title}
          </Text>
          <Text className="font-normal text-caption text-muted">
            {paused
              ? t("run__paused")
              : position > 0
                ? progressText
                : totalWeeks
                  ? t("run__week_of", { week, total: totalWeeks })
                  : t("run__week", { week })}
          </Text>
        </View>
      </View>
      <View
        className="flex-row flex-wrap gap-2"
        accessibilityLabel={t("run__cycle", { cycle: progress.cycle })}
      >
        {program.slots.map((slot, index) => {
          const state = stripState(slot, progress);
          const trained = state === "done";
          const rest = state === "rest";
          return (
            <View
              key={slot.id}
              accessible
              accessibilityLabel={t("run__slot_state", {
                day: index + 1,
                title: rest ? t("training__rest_day") : slotTitle(slot, t),
                state: t(SLOT_STATE_KEYS[state]),
              })}
              className={
                rest
                  ? "h-7 w-7 self-center items-center justify-center rounded-full bg-default opacity-40"
                  : trained
                    ? "h-10 w-10 items-center justify-center rounded-full bg-foreground"
                    : state === "next"
                      ? "h-10 w-10 items-center justify-center rounded-full border-2 border-foreground bg-default"
                      : "h-10 w-10 items-center justify-center rounded-full bg-default"
              }
            >
              {rest ? (
                <View className="size-1.5 rounded-full bg-muted" />
              ) : state === "skipped" ? (
                <View
                  className="h-px w-3 bg-foreground"
                  style={{ transform: [{ rotate: "-45deg" }] }}
                />
              ) : (
                <Text
                  className={
                    trained
                      ? "text-label font-semibold text-background"
                      : "text-label text-foreground"
                  }
                >
                  {slotTitle(slot, t).slice(0, 1).toLocaleUpperCase()}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      {!paused && next?.workoutId ? (
        <View className="flex-row items-center justify-between gap-3">
          <Text numberOfLines={1} className="font-normal flex-1 text-body text-foreground">
            {t("run__next", { title: slotTitle(next, t) })}
          </Text>
          <Button
            size="sm"
            className="rounded-full px-4"
            onPress={() => {
              if (next.workoutId)
                void startSlot(next.workoutId, {
                  runId: run.id,
                  slotId: next.id,
                  cycle: progress.cycle,
                });
            }}
          >
            <Button.Label>{t("training__start")}</Button.Label>
          </Button>
        </View>
      ) : null}
      {sheet}
    </View>
  );
}

/**
 * Offers to finish, continue or repeat a Program once its planned weeks have passed, the first
 * time the Train tab is focused for that Run. It draws nothing until the offer opens.
 */
export function RunEndOffer({ state }: { state: ReturnType<typeof useActiveProgram> }) {
  const { t } = useTranslation();
  const { run, week, totalWeeks, paused } = state;
  const [endOpen, setEndOpen] = useState(false);
  const offered = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (
        run &&
        !paused &&
        totalWeeks &&
        run.started_at &&
        !run.continued_at &&
        week > totalWeeks &&
        offered.current !== run.id
      ) {
        offered.current = run.id;
        setEndOpen(true);
      }
    }, [run, totalWeeks, week, paused]),
  );
  return (
    <ActionSheet
      title={t("run__end_title")}
      isOpen={endOpen}
      onOpenChange={setEndOpen}
      actions={[
        {
          key: "finish",
          label: t("run__finish"),
          icon: Check,
          onPress: () => void state.finish(),
        },
        { key: "keep", label: t("run__keep"), icon: Repeat, onPress: () => void state.keep() },
        { key: "again", label: t("run__again"), icon: Repeat, onPress: () => void state.again() },
      ]}
    />
  );
}
