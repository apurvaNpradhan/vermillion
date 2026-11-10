import { TRAINING_LIMITS } from "@workspace/shared";
import type { ProgramDetail, ProgramSlotDetail } from "@workspace/sync";
import { useThemeColor } from "heroui-native";
import {
  Copy,
  DotsThreeVertical,
  FloppyDisk,
  Moon,
  PencilSimple,
  Plus,
  Repeat,
  ShareNetwork,
  Trash,
  WarningCircle,
} from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { MarkdownText } from "@/platform/ui/markdown-text";
import { Page, ScrollPage } from "@/platform/ui/page";
import { Skeleton } from "@/platform/ui/skeleton";
import type { SwipeAction } from "@/platform/ui/swipe-row";

import { repeatCounts, rotationSummary } from "../rotation";
import { useProgram } from "../use-program";
import { useProgramActions } from "../use-program-actions";
import { useProgramMeta } from "../use-program-meta";
import { useSharePlan } from "../use-share-plan";
import { useStartWorkout } from "../use-start-workout";
import {
  AddWorkoutSheet,
  RepeatWorkoutSheet,
  type ProgramWorkoutChoice,
} from "./program-workout-sheets";
import { ProgramTile } from "./program-row";
import { ReorderList } from "./reorder-list";
import { RotationRow, slotTitle } from "./rotation-row";

/** The cover tile in the header. */
const COVER_SIZE = 88;

/** Lines of the description shown before "More". */
const DESCRIPTION_LINES = 4;

/** Where the Program screen sends the user. */
export type ProgramScreenProps = {
  id: string;
  /** Open the Workout editor (slice 2) for a Workout of this Program. */
  onOpenWorkout: (workoutId: string) => void;
  /** Open the details sheet. */
  onOpenDetails: () => void;
  /** The Program was deleted: leave the screen. */
  onClosed: () => void;
  /** A copy was made: open it in place of this one. */
  onOpenCopy: (id: string) => void;
};

/**
 * One Program: its description and planned length, then the Rotation as numbered Slots that
 * reorder by long press, with the actions that build it. Every edit is saved as it happens.
 */
export function ProgramScreen(props: ProgramScreenProps) {
  const { t } = useTranslation();
  const state = useProgram(props.id);

  if (state.status === "loading") {
    return (
      <ScrollPage title={t("training__program")} back>
        <Skeleton label={t("common__loading")} className="h-11 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </ScrollPage>
    );
  }
  if (state.status === "missing" || state.status === "error") {
    return (
      <ScrollPage title={t("training__program")} back>
        <EmptyState
          icon={WarningCircle}
          title={t(
            state.status === "missing" ? "training__program_missing" : "training__load_failed",
          )}
        />
      </ScrollPage>
    );
  }
  return <LoadedProgram program={state.program} {...props} />;
}

function LoadedProgram({
  program,
  onOpenWorkout,
  onOpenDetails,
  onClosed,
  onOpenCopy,
}: ProgramScreenProps & { program: ProgramDetail }) {
  const { t } = useTranslation();
  const foreground = useThemeColor("foreground");
  const actions = useProgramActions();
  const { fromPicker } = useStartWorkout();
  const { shareProgram } = useSharePlan();
  const [menuOpen, setMenuOpen] = useState(false);
  const [slotMenu, setSlotMenu] = useState<ProgramSlotDetail | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const slots = program.slots;
  const numbers = useMemo(() => new Map(slots.map((slot, index) => [slot.id, index + 1])), [slots]);
  const repeats = useMemo(() => repeatCounts(slots), [slots]);
  const summary = rotationSummary(slots);
  const meta = useProgramMeta(summary, null);
  const full = slots.length >= TRAINING_LIMITS.slotsPerProgram;

  /** One entry per Workout of this Program, in Rotation order. */
  const own = useMemo(() => {
    const seen = new Map<string, ProgramWorkoutChoice>();
    for (const slot of slots) {
      if (slot.workoutId === null || seen.has(slot.workoutId)) continue;
      seen.set(slot.workoutId, {
        id: slot.workoutId,
        title: slot.workout?.title ?? null,
        displayTitle: slotTitle(slot, (key) => t(key)),
      });
    }
    return [...seen.values()];
  }, [slots, t]);

  const menu: SwipeAction[] = [
    {
      key: "details",
      label: t("training__edit_details"),
      icon: PencilSimple,
      onPress: onOpenDetails,
    },
    {
      key: "share",
      label: t("training__share_as_text"),
      icon: ShareNetwork,
      onPress: () => void shareProgram(program.id, program.title),
    },
    {
      key: "duplicate",
      label: t("training__duplicate"),
      icon: Copy,
      onPress: () => {
        void actions.duplicate(program.id, program.title).then((copy) => {
          if (copy) onOpenCopy(copy);
        });
      },
    },
    {
      key: "delete",
      label: t("training__delete"),
      icon: Trash,
      tone: "danger",
      onPress: () => {
        void actions.remove(program.id, program.title).then((removed) => {
          if (removed) onClosed();
        });
      },
    },
  ];

  const slotActions: SwipeAction[] = (() => {
    if (!slotMenu) return [];
    const { workoutId, workout } = slotMenu;
    const title = workout ? slotTitle(slotMenu, (key) => t(key)) : null;
    const remove: SwipeAction = {
      key: "remove",
      label: t("training__remove_from_rotation"),
      icon: Trash,
      tone: "danger",
      onPress: () => void actions.removeSlot(slotMenu.id, title),
    };
    if (workoutId === null) return [remove];
    return [
      {
        key: "edit",
        label: t("training__edit_workout"),
        icon: PencilSimple,
        onPress: () => onOpenWorkout(workoutId),
      },
      {
        key: "duplicate",
        label: t("training__duplicate_as_new"),
        icon: Copy,
        onPress: () => void actions.duplicateSlot(slotMenu.id, workout?.title ?? null),
      },
      {
        key: "standalone",
        label: t("training__save_standalone"),
        icon: FloppyDisk,
        onPress: () => void actions.saveAsStandalone(workoutId),
      },
      remove,
    ];
  })();

  return (
    <>
      <Page
        title={program.title}
        back
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("training__program_menu")}
            onPress={() => setMenuOpen(true)}
            className="h-11 w-11 items-center justify-center"
          >
            <DotsThreeVertical size={22} weight="bold" color={foreground} />
          </Pressable>
        }
      >
        {({ header, contentContainerStyle, ...scroll }) => (
          <Animated.ScrollView
            {...scroll}
            className="flex-1"
            contentContainerStyle={contentContainerStyle}
            contentContainerClassName="gap-4"
            scrollEnabled={!dragging}
            keyboardShouldPersistTaps="handled"
          >
            <View className="px-4">{header}</View>
            <View className="gap-3 px-4">
              <View className="flex-row items-center gap-4">
                <ProgramTile title={program.title} size={COVER_SIZE} coverUri={program.coverUri} />
                <View className="flex-1 gap-1">
                  <Text className="text-body text-muted">{meta}</Text>
                  {program.plannedWeeks !== null ? (
                    <Text className="text-body text-muted">
                      {t("training__planned_summary", { count: program.plannedWeeks })}
                    </Text>
                  ) : null}
                </View>
              </View>
              {program.description !== null ? (
                <MarkdownText
                  markdown={program.description}
                  collapsedLines={DESCRIPTION_LINES}
                  moreLabel={t("training__description_more")}
                  lessLabel={t("training__description_less")}
                />
              ) : null}
              {program.description === null && program.plannedWeeks === null ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onOpenDetails}
                  className="min-h-11 justify-center"
                >
                  <Text className="text-body text-muted underline">
                    {t("training__add_details")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View className="gap-2">
              <Text
                accessibilityRole="header"
                className="px-4 font-semibold text-overline uppercase text-muted"
              >
                {t("training__rotation")}
              </Text>
              {slots.length === 0 ? (
                <Text className="px-4 text-body text-muted">{t("training__rotation_empty")}</Text>
              ) : (
                <View className="border-t border-border">
                  <ReorderList
                    items={slots}
                    onDraggingChange={setDragging}
                    onMove={(id, beforeId) => void actions.move(id, beforeId)}
                    renderItem={(slot, { collapsed }) => (
                      <RotationRow
                        slot={slot}
                        number={numbers.get(slot.id) ?? 0}
                        title={slotTitle(slot, (key) => t(key))}
                        repeats={slot.workoutId === null ? 1 : (repeats.get(slot.workoutId) ?? 1)}
                        collapsed={collapsed}
                        onOpen={(row) => row.workoutId !== null && onOpenWorkout(row.workoutId)}
                        onMenu={setSlotMenu}
                      />
                    )}
                  />
                </View>
              )}
            </View>
            <View className="gap-3 px-4">
              <Button
                variant={slots.length === 0 ? "primary" : "secondary"}
                isDisabled={full}
                onPress={() => setAddOpen(true)}
              >
                <Plus size={16} color={foreground} weight="bold" />
                <Button.Label>{t("training__add_workout")}</Button.Label>
              </Button>
              <View className="flex-row gap-3">
                <Button
                  className="flex-1"
                  variant="secondary"
                  isDisabled={full}
                  onPress={() => void actions.addRest(program.id)}
                >
                  <Moon size={16} color={foreground} />
                  <Button.Label>{t("training__add_rest")}</Button.Label>
                </Button>
                <Button
                  className="flex-1"
                  variant="secondary"
                  isDisabled={full || own.length === 0}
                  onPress={() => setRepeatOpen(true)}
                >
                  <Repeat size={16} color={foreground} />
                  <Button.Label>{t("training__repeat_workout")}</Button.Label>
                </Button>
              </View>
            </View>
          </Animated.ScrollView>
        )}
      </Page>
      <ActionSheet
        title={program.title}
        actions={menu}
        isOpen={menuOpen}
        onOpenChange={setMenuOpen}
      />
      <ActionSheet
        title={
          slotMenu?.workout
            ? slotTitle(slotMenu, (key) => t(key))
            : slotMenu
              ? t("training__rest_day")
              : ""
        }
        actions={slotActions}
        isOpen={slotMenu !== null}
        onOpenChange={(open) => {
          if (!open) setSlotMenu(null);
        }}
      />
      <AddWorkoutSheet
        isOpen={addOpen}
        onOpenChange={setAddOpen}
        own={own}
        onNew={() => void fromPicker(program.id)}
        onCopyStandalone={(workoutId) => void actions.addCopy(program.id, workoutId, null)}
        onCopyOwn={(choice) => void actions.addCopy(program.id, choice.id, { title: choice.title })}
      />
      <RepeatWorkoutSheet
        isOpen={repeatOpen}
        onOpenChange={setRepeatOpen}
        own={own}
        onPick={(workoutId) => void actions.repeat(program.id, workoutId)}
      />
    </>
  );
}
