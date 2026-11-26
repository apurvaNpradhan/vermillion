import {
  PHASES,
  modifiersFor,
  withModifiers,
  withPattern,
  withWeekPhase,
  type Phase,
} from "@workspace/shared";
import type { ProgramDetail, readRuns } from "@workspace/sync";
import { useState } from "react";
import { Text, View } from "react-native";

import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useTranslation } from "@/platform/i18n";
import { usePhaseText } from "@/platform/phase-text";
import { Button } from "@/platform/ui/button";
import { ListRow, ListSection } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { SectionHeader } from "@/platform/ui/section-header";
import type { useProgramActions } from "@/training/programs/use-program-actions";

import { PatternSheet } from "./pattern-sheet";
import { PhaseModifiersSheet } from "./phase-modifiers-sheet";
import { PhaseStrip } from "./phase-strip";
import { stripBlocks, type StripBlock } from "./phase-strip-math";

type AsPattern = "pattern";

/**
 * The phases of one Program, under its cover row: the week strip (a block per week, tap one to
 * set its phase), the "Pattern" that repeats and what each phase does to a Workout (tap to edit).
 * A Program with no pattern shows a single quiet invitation to set one.
 */
export function PhaseSection({
  program,
  run,
  actions,
  trainedAt,
}: {
  program: ProgramDetail;
  /** The active Run when this Program is the active one; null otherwise. */
  run: Awaited<ReturnType<typeof readRuns>>[number] | null;
  actions: ReturnType<typeof useProgramActions>;
  trainedAt?: readonly string[];
}) {
  const { t } = useTranslation();
  const text = usePhaseText();
  const timeZone = useDeviceTimeZone();
  const plan = program.phasePlan;
  const now = new Date();
  const [patternOpen, setPatternOpen] = useState(false);
  const [week, setWeek] = useState<StripBlock | null>(null);
  const [editing, setEditing] = useState<Phase | null>(null);
  const blocks = plan
    ? stripBlocks({
        plan,
        current: run ? { run, now, timeZone, trainedAt } : undefined,
        plannedWeeks: program.plannedWeeks,
      })
    : [];
  const save = (next: ProgramDetail["phasePlan"]) =>
    void actions.update(program.id, { phase_plan: next });
  const overridden =
    week !== null && plan?.overrides.some((item) => item.week === week.programWeek);

  return (
    <View className="gap-2">
      <View className="px-4">
        <SectionHeader
          title={t("phase__title")}
          actionLabel={t("phase__pattern")}
          actionAccessibilityLabel={t("phase__pattern_title")}
          onAction={() => setPatternOpen(true)}
        />
      </View>
      {plan === null ? (
        <View className="items-start gap-3 px-4">
          <Text className="font-normal text-body text-muted">{t("phase__none")}</Text>
          <Button variant="secondary" onPress={() => setPatternOpen(true)}>
            <Button.Label>{t("phase__set_pattern")}</Button.Label>
          </Button>
        </View>
      ) : (
        <>
          <Text className="px-4 font-normal text-caption text-muted">
            {text.pattern(plan.pattern)}
          </Text>
          <PhaseStrip blocks={blocks} onSelect={setWeek} />
          <View className="gap-3 px-4 pt-2">
            <ListSection>
              {PHASES.map((phase) => (
                <ListRow
                  key={phase}
                  title={text.name(phase)}
                  description={text.effects(phase, modifiersFor(plan, phase), plan.test_top)}
                  onPress={() => setEditing(phase)}
                />
              ))}
            </ListSection>
          </View>
        </>
      )}
      {patternOpen ? (
        <PatternSheet
          pattern={plan?.pattern ?? []}
          onSave={(pattern) => save(withPattern(plan, pattern))}
          onClose={() => setPatternOpen(false)}
        />
      ) : null}
      {editing !== null && plan ? (
        <PhaseModifiersSheet
          phase={editing}
          modifiers={modifiersFor(plan, editing)}
          testTop={plan.test_top}
          testWorkups={plan.test_workups ?? false}
          onSave={(modifiers, testTop, testWorkups) =>
            save({
              ...withModifiers(plan, editing, modifiers),
              test_top: testTop,
              test_workups: testWorkups,
            })
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
      <OptionSheet<Phase | AsPattern>
        isOpen={week !== null}
        onOpenChange={(open) => {
          if (!open) setWeek(null);
        }}
        title={week ? t("phase__week_title", { week: week.week }) : ""}
        description={week ? t("phase__week_body") : undefined}
        options={[
          ...PHASES.map((phase) => ({
            value: phase,
            label: text.name(phase),
            description: text.hint(phase),
          })),
          ...(overridden ? [{ value: "pattern" as const, label: t("phase__as_pattern") }] : []),
        ]}
        value={week?.phase ?? null}
        onSelect={(value) => {
          if (!week || !plan) return;
          save(withWeekPhase(plan, week.programWeek, value === "pattern" ? null : value));
        }}
      />
    </View>
  );
}
