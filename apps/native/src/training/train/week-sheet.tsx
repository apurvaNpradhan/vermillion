import { ArrowUUpLeft, CalendarBlank, Pause, Play, TrendDown } from "phosphor-react-native";

import { useTranslation } from "@/platform/i18n";
import { usePhaseText } from "@/platform/phase-text";
import { ActionSheet } from "@/platform/ui/action-sheet";
import type { SwipeAction } from "@/platform/ui/swipe-row";
import { useDeloadWeek } from "@/training/phases/use-deload-week";
import type { useActiveProgram } from "@/training/programs/use-active-program";

/**
 * What the week chip on Train opens: this week's phase and what it asks, "Deload this week" (or
 * "Undo deload" until a workout is logged in it), "Pause program" and "Plan your weeks".
 */
export function WeekSheet({
  state,
  isOpen,
  onOpenChange,
  onPlan,
}: {
  state: ReturnType<typeof useActiveProgram>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open Plan your weeks for the Program. */
  onPlan: (programId: string) => void;
}) {
  const { t } = useTranslation();
  const text = usePhaseText();
  const { program, run, phase, paused, week, totalWeeks } = state;
  const deload = useDeloadWeek({
    run,
    week,
    sessions: state.sessionPhases,
    hasPlan: program?.phasePlan != null,
  });
  if (!program || !run) return null;
  const title = totalWeeks
    ? t("run__week_of", { week, total: totalWeeks })
    : t("run__week", { week });
  const description =
    phase && (program.phasePlan !== null || phase.phase === "deload")
      ? t("phase__banner", {
          phase: text.name(phase.phase),
          effects: text.effects(phase.phase, phase.modifiers, phase.testTop),
        })
      : undefined;
  const actions: SwipeAction[] = [
    ...(deload.canUndo
      ? [{ key: "undo", label: t("deload__undo"), icon: ArrowUUpLeft, onPress: deload.undo }]
      : !paused && phase?.phase !== "deload"
        ? [{ key: "deload", label: t("deload__action"), icon: TrendDown, onPress: deload.ask }]
        : []),
    {
      key: "pause",
      label: t(paused ? "run__resume_run" : "run__pause_run"),
      icon: paused ? Play : Pause,
      onPress: () => void state.changePause(!paused),
    },
    {
      key: "plan",
      label: t("run__plan_weeks"),
      icon: CalendarBlank,
      onPress: () => onPlan(program.id),
    },
  ];
  return (
    <>
      <ActionSheet
        title={title}
        description={description}
        actions={actions}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
      />
      {deload.dialog}
    </>
  );
}
