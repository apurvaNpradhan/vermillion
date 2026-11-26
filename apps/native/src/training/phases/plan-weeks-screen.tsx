import {
  PATTERN_PRESETS,
  PHASES,
  PHASE_PRESETS,
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
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useTranslation } from "@/platform/i18n";
import { usePhaseText } from "@/platform/phase-text";
import { EmptyState } from "@/platform/ui/empty-state";
import { Hint } from "@/platform/ui/hint";
import { useHint } from "@/platform/ui/use-hint";
import { ListRow, ListSection } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { ScrollPage } from "@/platform/ui/page";
import { useProgram } from "@/platform/training/use-program";
import { useActiveRun } from "@/training/programs/use-active-program";
import { useProgramActions } from "@/training/programs/use-program-actions";
import { Stepper } from "@/training/targets/stepper";

import { stepModifier } from "./phase-modifiers";
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
  const weeks = program.plannedWeeks;
  const [chip, setChip] = useState<number | null>(null);
  const [week, setWeek] = useState<StripBlock | null>(null);
  const [editing, setEditing] = useState<Phase | null>(null);

  const hint = useHint("plan-weeks");
  // Any edit on this page is the thing the hint describes: the first one closes it.
  const { dismiss: dismissHint } = hint;
  const save = (edit: (current: PhasePlan | null) => PhasePlan | null) => {
    dismissHint();
    void actions.update(program.id, ({ phase_plan }) => {
      const stored = phase_plan ?? null;
      const next = edit(stored);
      return next === stored ? {} : { phase_plan: next };
    });
  };
  const blocks = stripBlocks({
    plan: shown,
    current: run
      ? {
          run,
          now: new Date(),
          timeZone,
          trainedAt: active.runs.value?.phaseStarts,
          history: active.runs.value?.phaseHistory,
        }
      : undefined,
    plannedWeeks: weeks,
  });
  const pattern = plan?.pattern ?? [];
  const overridden =
    week !== null && shown.overrides.some((item) => item.week === week.programWeek);

  const stepWeeks = (direction: 1 | -1) => {
    dismissHint();
    void actions.update(program.id, ({ planned_weeks }) => {
      const next = (planned_weeks ?? 0) + direction;
      return {
        planned_weeks:
          next < TRAINING_LIMITS.plannedWeeksMin
            ? null
            : Math.min(TRAINING_LIMITS.plannedWeeksMax, next),
      };
    });
  };

  return (
    <ScrollPage title={t("run__plan_weeks")} back backFallback="/train">
      {hint.visible ? <Hint text={t("hint__plan_weeks")} onDismiss={hint.dismiss} /> : null}
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
                save((current) => withPattern(current, addPatternWeek(current?.pattern ?? [])));
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
              onPress={() => save((current) => withPattern(current, preset))}
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
        {PHASES.map((phase) => {
          const effects = text.effects(phase, modifiersFor(shown, phase), shown.test_top);
          return (
            <ListRow
              key={phase}
              title={text.name(phase)}
              description={effects}
              accessibilityHint={effects}
              onPress={() => setEditing(phase)}
            />
          );
        })}
      </ListSection>

      {editing !== null ? (
        <PhaseModifiersSheet
          phase={editing}
          modifiers={modifiersFor(shown, editing)}
          testTop={shown.test_top}
          testWorkups={shown.test_workups ?? false}
          onStep={(key, direction) =>
            save((current) => {
              const latest = planOrBuild(current);
              return withModifiers(
                latest,
                editing,
                stepModifier(modifiersFor(latest, editing), key, direction),
              );
            })
          }
          onReset={() =>
            save((current) => withModifiers(planOrBuild(current), editing, PHASE_PRESETS[editing]))
          }
          onTopChange={(test_top) => save((current) => ({ ...planOrBuild(current), test_top }))}
          onWorkupsChange={(test_workups) =>
            save((current) => ({ ...planOrBuild(current), test_workups }))
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
          ...(pattern.length === 1 && pattern[0] === "build" && withPattern(plan, []) !== null
            ? []
            : [{ value: "remove" as const, label: t("phase__pattern_remove") }]),
        ]}
        value={chip === null ? null : (pattern[chip] ?? null)}
        onSelect={(value) => {
          if (chip === null) return;
          save((current) => {
            if (!current?.pattern[chip]) return current;
            const next =
              value === "remove"
                ? removePatternWeek(current.pattern, chip)
                : setPatternWeek(current.pattern, chip, value);
            return withPattern(current, next);
          });
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
          save((current) =>
            current === null && (value === "pattern" || value === "build")
              ? null
              : withWeekPhase(
                  planOrBuild(current),
                  week.week,
                  value === "pattern" ? null : value,
                  run?.inserted_deloads,
                ),
          );
        }}
      />
    </ScrollPage>
  );
}
