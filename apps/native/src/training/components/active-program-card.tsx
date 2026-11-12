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
import type { useActiveProgram } from "../use-active-program";
import { slotTitle } from "./rotation-row";
import { ProgramTile } from "./program-row";

export function ActiveProgramCard({
  state,
  offerEnd = false,
}: {
  /** Read by the screen, so the card appears together with the rest of it. */
  state: ReturnType<typeof useActiveProgram>;
  offerEnd?: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { program, run, progress, week } = state;
  const { start, sheet } = useStartSession();
  const [endOpen, setEndOpen] = useState(false);
  const offered = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (
        offerEnd &&
        run &&
        program?.plannedWeeks &&
        run.started_at &&
        !run.continued_at &&
        week > program.plannedWeeks &&
        offered.current !== run.id
      ) {
        offered.current = run.id;
        setEndOpen(true);
      }
    }, [offerEnd, run, program, week]),
  );
  if (!program || !run) return null;
  const next = program.slots.find((s) => s.id === progress.next?.id);
  const position = next ? program.slots.findIndex((slot) => slot.id === next.id) + 1 : 0;
  const progressText = program.plannedWeeks
    ? t("run__progress_of", { week, total: program.plannedWeeks, workout: position })
    : t("run__progress", { week, workout: position });
  return (
    <View className="gap-3">
      <SectionHeader
        title={t("run__active")}
        actionLabel={t("run__change")}
        onAction={() => router.push("/train/programs")}
      />
      <View className="flex-row items-center gap-3">
        <ProgramTile title={program.title} size={40} coverUri={program.coverUri} />
        <View className="flex-1">
          <Text numberOfLines={1} className="font-semibold text-body text-foreground">
            {program.title}
          </Text>
          <Text className="text-caption text-muted">
            {position > 0
              ? progressText
              : program.plannedWeeks
                ? t("run__week_of", { week, total: program.plannedWeeks })
                : t("run__week", { week })}
          </Text>
        </View>
      </View>
      <View
        className="flex-row flex-wrap gap-2"
        accessibilityLabel={t("run__cycle", { cycle: progress.cycle })}
      >
        {program.slots.map((slot) => {
          const trained = progress.trained.has(slot.id);
          const rest = slot.workoutId === null;
          const next = progress.next?.id === slot.id;
          return (
            <View
              key={slot.id}
              accessible
              accessibilityLabel={t("run__slot_state", {
                title: slotTitle(slot, t),
                state: t(trained ? "run__trained" : next ? "run__up_next" : "run__untrained"),
              })}
              className={
                rest
                  ? "h-7 w-7 self-center items-center justify-center rounded-full bg-default opacity-40"
                  : trained
                    ? "h-10 w-10 items-center justify-center rounded-full bg-foreground"
                    : next
                      ? "h-10 w-10 items-center justify-center rounded-full border-2 border-identity bg-identity-soft"
                      : "h-10 w-10 items-center justify-center rounded-full border border-border"
              }
            >
              <Text
                className={
                  trained
                    ? "text-label font-semibold text-background"
                    : "text-label text-foreground"
                }
              >
                {rest ? "·" : slotTitle(slot, t).slice(0, 1).toLocaleUpperCase()}
              </Text>
            </View>
          );
        })}
      </View>
      {next?.workoutId ? (
        <View className="flex-row items-center justify-between gap-3">
          <Text numberOfLines={1} className="flex-1 text-body text-foreground">
            {t("run__next", { title: slotTitle(next, t) })}
          </Text>
          <Button
            size="sm"
            className="rounded-full px-4"
            onPress={() => void start(next.workoutId)}
          >
            <Button.Label>{t("training__start")}</Button.Label>
          </Button>
        </View>
      ) : null}
      {sheet}
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
    </View>
  );
}
