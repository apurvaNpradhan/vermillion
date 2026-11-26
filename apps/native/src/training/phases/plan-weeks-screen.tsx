import {
  PATTERN_PRESETS,
  PHASES,
  PHASE_PATTERN_MAX,
  TRAINING_LIMITS,
  addPatternWeek,
  modifiersFor,
  planOrBuild,
  removePatternWeek,
  setPatternWeek,
  withModifiers,
  withPattern,
  withWeekPhase,
  type Phase,
  type PhasePlan,
} from "@workspace/shared";
import type { ProgramDetail } from "@workspace/sync";
import { WarningCircle } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useTranslation } from "@/platform/i18n";
import { usePhaseText } from "@/platform/phase-text";
import { EmptyState } from "@/platform/ui/empty-state";
import { ListRow, ListSection } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { ScrollPage } from "@/platform/ui/page";
import { useProgram } from "@/platform/training/use-program";
import { useActiveRun } from "@/training/programs/use-active-program";
import { useProgramActions } from "@/training/programs/use-program-actions";
import { useCoalescedWriter } from "@/training/shared/use-coalesced-writer";
import { Stepper } from "@/training/targets/stepper";

import { PhaseModifiersSheet } from "./phase-modifiers-sheet";
import { PhaseStrip } from "./phase-strip";
import { stripBlocks, type StripBlock } from "./phase-strip-math";

type Choice = Phase | "remove";
type WeekChoice = Phase | "pattern";

/**
 * Plan your weeks: everything about a Program's phases on one page. Its length, the pattern that
 * repeats (chips: tap one to change it or take it out, "+ Week" to add), usual patterns to start
 * from, the week strip (tap a week to change only that week) and what each phase does. Every
 * change is saved as it is made. A Program with no phases shows plain Build weeks.
 */
export function PlanWeeksScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const state = useProgram(id);
  if (state.status === "ready") return <LoadedPlan program={state.program} />;
  return (
    <ScrollPage title={t("run__plan_weeks")} back backFallback="/train">
      {state.status === "error" || state.status === "missing" ? (
        <EmptyState
          icon={WarningCircle}
          title={t(
            state.status === "missing" ? "training__program_missing" : "training__load_failed",
          )}
        />
      ) : null}
    </ScrollPage>
  );
}

function LoadedPlan({ program }: { program: ProgramDetail }) {
  const { t } = useTranslation();
  const text = usePhaseText();
  const timeZone = useDeviceTimeZone();
  const actions = useProgramActions();
  const active = useActiveRun();
  const run = active.run?.program_id === program.id ? active.run : null;
  const plan = program.phasePlan;
  const shown = planOrBuild(plan);
  const writer = useCoalescedWriter((patch: { planned_weeks: number | null }) =>
    actions.update(program.id, patch),
  );
  const [weeks, setWeeks] = useState(program.plannedWeeks);
  const [chip, setChip] = useState<number | null>(null);
  const [week, setWeek] = useState<StripBlock | null>(null);
  const [editing, setEditing] = useState<Phase | null>(null);

  // Take in changes from the database (another device) unless an edit of ours is on its way.
  useEffect(() => {
    if (!writer.busy()) setWeeks(program.plannedWeeks);
    // `writer` is stable; the stored length is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.plannedWeeks]);

  const save = (next: PhasePlan | null) => void actions.update(program.id, { phase_plan: next });
  const blocks = stripBlocks({
    plan: shown,
    current: run
      ? { run, now: new Date(), timeZone, trainedAt: active.runs.value?.phaseStarts }
      : undefined,
    plannedWeeks: weeks,
  });
  const pattern = plan?.pattern ?? [];
  const overridden =
    week !== null && shown.overrides.some((item) => item.week === week.programWeek);

  const stepWeeks = (direction: 1 | -1) => {
    const next =
      weeks === null
        ? direction === 1
          ? TRAINING_LIMITS.plannedWeeksMin
          : null
        : weeks + direction < TRAINING_LIMITS.plannedWeeksMin
          ? null
          : Math.min(TRAINING_LIMITS.plannedWeeksMax, weeks + direction);
    setWeeks(next);
    writer.queue({ planned_weeks: next });
  };

  return (
    <ScrollPage title={t("run__plan_weeks")} back backFallback="/train">
      <View className="gap-1.5">
        <Text className="text-label font-medium text-foreground">
          {t("training__planned_length")}
        </Text>
        <View className="rounded-xl bg-field px-2 py-1">
          <Stepper
            label={t("training__planned_length")}
            valueText={
              weeks === null
                ? t("phase__open_ended")
                : t("training__program_meta_weeks", { count: weeks })
            }
            onStep={stepWeeks}
            canDecrement={weeks !== null}
            canIncrement={weeks === null || weeks < TRAINING_LIMITS.plannedWeeksMax}
            decrementLabel={t("training__planned_less")}
            incrementLabel={t("training__planned_more")}
          />
        </View>
      </View>

      <View className="gap-3">
        <View className="gap-1">
          <Text accessibilityRole="header" className="font-semibold text-title-md text-foreground">
            {t("phase__pattern")}
          </Text>
          <Text className="font-normal text-caption text-muted">
            {pattern.length === 0 ? t("phase__pattern_empty") : t("phase__pattern_body")}
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {pattern.map((phase, index) => (
            <Pressable
              // The pattern may repeat a phase; its place is its identity.
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              accessibilityRole="button"
              accessibilityLabel={t("phase__pattern_week", {
                week: index + 1,
                phase: text.name(phase),
              })}
              accessibilityHint={t("phase__pattern_week_hint")}
              onPress={() => setChip(index)}
              className="min-h-11 min-w-20 items-center justify-center rounded-xl bg-default px-3 active:opacity-70"
            >
              <Text className="font-normal text-caption tabular-nums text-muted">{index + 1}</Text>
              <Text className="font-medium text-body text-foreground">{text.name(phase)}</Text>
            </Pressable>
          ))}
          {pattern.length < PHASE_PATTERN_MAX ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("phase__pattern_add_label")}
              onPress={() => {
                haptic.tick();
                save(withPattern(plan, addPatternWeek(pattern)));
              }}
              className="min-h-11 min-w-20 items-center justify-center rounded-xl bg-default px-3 active:opacity-70"
            >
              <Text className="font-medium text-body text-muted">{t("phase__pattern_add")}</Text>
            </Pressable>
          ) : null}
        </View>
        <View className="gap-1">
          <Text className="font-normal text-caption text-muted">{t("phase__presets")}</Text>
          {PATTERN_PRESETS.map((preset) => (
            <Pressable
              key={preset.join("-")}
              accessibilityRole="button"
              onPress={() => save(withPattern(plan, preset))}
              className="min-h-11 justify-center active:opacity-60"
            >
              <Text className="font-normal text-body text-foreground">{text.pattern(preset)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="-mx-4 gap-2">
        <View className="gap-1 px-4">
          <Text accessibilityRole="header" className="font-semibold text-title-md text-foreground">
            {t("phase__strip_title")}
          </Text>
          <Text className="font-normal text-caption text-muted">{t("phase__strip_body")}</Text>
        </View>
        <PhaseStrip blocks={blocks} onSelect={setWeek} />
      </View>

      <ListSection title={t("phase__effects_title")} variant="plain">
        {PHASES.map((phase) => (
          <ListRow
            key={phase}
            title={text.name(phase)}
            description={text.effects(phase, modifiersFor(shown, phase), shown.test_top)}
            onPress={() => setEditing(phase)}
          />
        ))}
      </ListSection>

      {editing !== null ? (
        <PhaseModifiersSheet
          phase={editing}
          modifiers={modifiersFor(shown, editing)}
          testTop={shown.test_top}
          testWorkups={shown.test_workups ?? false}
          onSave={(modifiers, testTop, testWorkups) =>
            save({
              ...withModifiers(shown, editing, modifiers),
              test_top: testTop,
              test_workups: testWorkups,
            })
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
      <OptionSheet<Choice>
        isOpen={chip !== null}
        onOpenChange={(open) => {
          if (!open) setChip(null);
        }}
        title={chip === null ? "" : t("phase__pattern_week_title", { week: chip + 1 })}
        description={chip === null ? undefined : t("phase__pattern_week_body")}
        options={[
          ...PHASES.map((phase) => ({
            value: phase,
            label: text.name(phase),
            description: text.hint(phase),
          })),
          { value: "remove" as const, label: t("phase__pattern_remove") },
        ]}
        value={chip === null ? null : (pattern[chip] ?? null)}
        onSelect={(value) => {
          if (chip === null) return;
          save(
            withPattern(
              plan,
              value === "remove"
                ? removePatternWeek(pattern, chip)
                : setPatternWeek(pattern, chip, value),
            ),
          );
        }}
      />
      <OptionSheet<WeekChoice>
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
          if (!week) return;
          save(withWeekPhase(shown, week.programWeek, value === "pattern" ? null : value));
        }}
      />
    </ScrollPage>
  );
}
