import { TRAINING_LIMITS } from "@workspace/shared";
import { X } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useHideTabBar } from "@/platform/navigation/tab-action";
import { EmptyState } from "@/platform/ui/empty-state";
import { Field } from "@/platform/ui/field";
import { Skeleton } from "@/platform/ui/skeleton";

import { useCoalescedWriter } from "../use-coalesced-writer";
import { useProgram } from "../use-program";
import { useProgramActions } from "../use-program-actions";
import { SavedTextField } from "./saved-text-field";
import { SheetFrame } from "./sheet-frame";
import { Stepper } from "./stepper";

type Patch = { title?: string; description?: string | null; planned_weeks?: number | null };

/**
 * The details of a Program: title, planned length (Off, or 1 to 52 weeks) and the Markdown
 * description. Edits show at once and are written together once they pause, so there is no Save.
 */
export function ProgramDetailsScreen({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const state = useProgram(id);
  useHideTabBar(true);
  const gone = state.status === "missing";
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);

  if (state.status === "ready") {
    return <LoadedDetails program={state.program} onClose={onClose} />;
  }
  return (
    <SheetFrame title={t("training__program_details_title")} onClose={onClose}>
      {state.status === "error" ? (
        <EmptyState icon={X} title={t("training__load_failed")} />
      ) : (
        <>
          <Skeleton label={t("common__loading")} className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
        </>
      )}
    </SheetFrame>
  );
}

function LoadedDetails({
  program,
  onClose,
}: {
  program: NonNullable<Extract<ReturnType<typeof useProgram>, { status: "ready" }>["program"]>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const actions = useProgramActions();
  const writer = useCoalescedWriter((patch: Patch) => actions.update(program.id, patch));

  const [title, setTitle] = useState(program.title);
  const [weeks, setWeeks] = useState(program.plannedWeeks);
  const blank = title.trim() === "";

  // Take in changes from the database (another device) unless an edit of ours is on its way.
  useEffect(() => {
    if (!writer.busy()) {
      setTitle(program.title);
      setWeeks(program.plannedWeeks);
    }
    // `writer` is stable; the stored values are the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.title, program.plannedWeeks]);

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
    <SheetFrame
      title={t("training__program_details_title")}
      onClose={() => {
        writer.flush();
        onClose();
      }}
    >
      <Field
        label={t("training__name_label")}
        value={title}
        onChangeText={(next) => {
          setTitle(next);
          if (next.trim() !== "") writer.queue({ title: next });
        }}
        onBlur={() => {
          if (blank) setTitle(program.title);
        }}
        error={blank ? t("training__title_required") : undefined}
        maxLength={TRAINING_LIMITS.titleMax}
        returnKeyType="done"
      />

      <View className="gap-1.5">
        <Text className="text-label font-medium text-foreground">
          {t("training__planned_length")}
        </Text>
        <View className="rounded-xl bg-field px-2 py-1">
          <Stepper
            label={t("training__planned_length")}
            valueText={
              weeks === null
                ? t("training__planned_off")
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

      <SavedTextField
        label={t("training__description_label")}
        description={t("training__description_hint")}
        value={program.description}
        onText={(description) => writer.queue({ description })}
        placeholder={t("training__description_placeholder")}
        multiline
        autoCapitalize="sentences"
        maxLength={TRAINING_LIMITS.descriptionMax}
        className="min-h-40"
      />
    </SheetFrame>
  );
}
