import { useRouter } from "expo-router";
import { Check, Repeat } from "phosphor-react-native";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { useStartSession } from "@/session";
import { useActiveProgram } from "../use-active-program";
import { slotTitle } from "./rotation-row";
import { ProgramTile } from "./program-row";

export function ActiveProgramCard({ offerEnd = false }: { offerEnd?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const state = useActiveProgram();
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
  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <ProgramTile title={program.title} size={56} coverUri={program.coverUri} />
        <View className="flex-1">
          <Text className="text-caption text-muted">{t("run__active")}</Text>
          <Text className="text-title-md font-semibold text-foreground">{program.title}</Text>
          <Text className="text-body text-muted">
            {program.plannedWeeks
              ? t("run__week_of", { week, total: program.plannedWeeks })
              : t("run__week", { week })}
          </Text>
        </View>
        <Button variant="tertiary" onPress={() => router.push("/train/programs")}>
          <Button.Label>{t("run__change")}</Button.Label>
        </Button>
      </View>
      <View
        className="flex-row flex-wrap gap-2"
        accessibilityLabel={t("run__cycle", { cycle: progress.cycle })}
      >
        {program.slots.map((slot, index) => (
          <Text
            key={slot.id}
            accessibilityLabel={slotTitle(slot, t)}
            className={
              slot.workoutId === null
                ? "text-muted opacity-40"
                : progress.trained.has(slot.id)
                  ? "text-foreground font-bold"
                  : "text-muted"
            }
          >
            {progress.trained.has(slot.id) ? "●" : "○"} {index + 1}
          </Text>
        ))}
      </View>
      {next?.workoutId ? (
        <View className="gap-2">
          <Text className="text-body text-foreground">
            {t("run__next", { title: slotTitle(next, t) })}
          </Text>
          <Button onPress={() => void start(next.workoutId)}>
            <Button.Label>{t("session__start")}</Button.Label>
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
