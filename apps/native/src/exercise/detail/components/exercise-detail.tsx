import {
  EQUIPMENT_KEYS,
  EXERCISE_TYPE_KEYS,
  MUSCLE_GROUP_KEYS,
  type MuscleGroup,
} from "@workspace/shared";
import type { ExerciseDetail } from "@workspace/sync";
import { useThemeColor } from "heroui-native";
import {
  Archive,
  ArrowCounterClockwise,
  CaretDown,
  DotsThreeVertical,
  Info,
  PencilSimple,
  Plus,
} from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";

import { BodyMapPair, isBodyGroup, type BodyGroup } from "@/body-map";
import { usePreferences } from "@/preferences";
import { ExerciseNumbers } from "./exercise-numbers";
import { RecentSessions } from "./recent-sessions";
import { appConfig } from "@/platform/app-config";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Notice } from "@/platform/ui/notice";
import { Page, ScrollPage } from "@/platform/ui/page";
import { Skeleton } from "@/platform/ui/skeleton";
import type { SwipeAction } from "@/platform/ui/swipe-row";

import { thumbnailUrl, videoUrl } from "../../media-url";
import { instructionSteps } from "../instruction-steps";
import { useExercise, useSwapCandidates } from "../use-exercise";
import { useExerciseHistory } from "../use-exercise-history";
import { SwapRow } from "./swap-row";
import { VideoHero } from "./video-hero";

/** Video height as a share of the width: 4:3 with no history, 16:9 once there is some. */
const HERO_RATIO_CATALOG = 3 / 4;
const HERO_RATIO_WITH_HISTORY = 9 / 16;

export type ExerciseDetailProps = {
  id: string;
  onSeeHistory: () => void;
  /** Open the library filtered to a muscle group, when browsing is available. */
  onBrowseGroup?: (group: MuscleGroup) => void;
  /** Open another exercise (a swap candidate). */
  onOpenExercise: (id: string) => void;
  /** The header menu of a Custom exercise; a menu with none of them is not shown. */
  onEdit?: (id: string) => void;
  onArchive?: (id: string, title: string) => void;
  onRestore?: (id: string) => void;
  /** Offer "Add to workout" for a live exercise. */
  onAddToWorkout?: (id: string) => void;
};

/**
 * One exercise, one scroll: the video, title and chips, the muscle map, the form steps and
 * swap candidates. The user's own numbers go first once training exists. Everything is read from
 * the local database through the module hooks.
 */
export function ExerciseDetailScreen(props: ExerciseDetailProps) {
  const { t } = useTranslation();
  const state = useExercise(props.id);

  if (state.status === "loading") {
    return (
      <ScrollPage title={t("exercise__title")} back>
        <Skeleton label={t("common__loading")} className="h-56 w-full" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </ScrollPage>
    );
  }
  if (state.status === "missing" || state.status === "error") {
    return (
      <ScrollPage title={t("exercise__title")} back>
        <EmptyState
          icon={Info}
          title={t(
            state.status === "missing" ? "exercise__detail_missing" : "exercise__load_failed",
          )}
        />
        {state.status === "missing" ? (
          <Text className="px-4 text-center text-caption text-muted">
            {t("exercise__detail_missing_hint")}
          </Text>
        ) : null}
      </ScrollPage>
    );
  }
  return <LoadedDetail exercise={state.exercise} {...props} />;
}

function LoadedDetail({
  exercise,
  onBrowseGroup,
  onOpenExercise,
  onEdit,
  onArchive,
  onRestore,
  onAddToWorkout,
  onSeeHistory,
}: ExerciseDetailProps & { exercise: ExerciseDetail }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const history = useExerciseHistory(exercise.id);
  const { preferences } = usePreferences();
  const hasHistory = history.status === "ready" && history.sessions.length > 0;
  const swaps = useSwapCandidates(exercise);
  const foreground = useThemeColor("foreground");
  const [menuOpen, setMenuOpen] = useState(false);

  const video = videoUrl(appConfig.urls.exerciseMedia, exercise.videoKey);
  const poster = thumbnailUrl(appConfig.urls.exerciseMedia, exercise.thumbnailKey);
  const hasMedia = video !== null || poster !== null;
  const heroHeight = Math.round(
    width * (hasHistory ? HERO_RATIO_WITH_HISTORY : HERO_RATIO_CATALOG),
  );

  const menu = useMemo<SwipeAction[]>(() => {
    if (!exercise.isCustom) return [];
    const items: SwipeAction[] = [];
    if (onEdit) {
      items.push({
        key: "edit",
        label: t("exercise__detail_edit"),
        icon: PencilSimple,
        onPress: () => onEdit(exercise.id),
      });
    }
    if (exercise.isArchived && onRestore) {
      items.push({
        key: "restore",
        label: t("exercise__detail_restore"),
        icon: ArrowCounterClockwise,
        onPress: () => onRestore(exercise.id),
      });
    }
    if (!exercise.isArchived && onArchive) {
      items.push({
        key: "archive",
        label: t("exercise__detail_archive"),
        icon: Archive,
        tone: "danger",
        onPress: () => onArchive(exercise.id, exercise.title),
      });
    }
    return items;
  }, [
    exercise.id,
    exercise.title,
    exercise.isCustom,
    exercise.isArchived,
    onEdit,
    onArchive,
    onRestore,
    t,
  ]);

  const steps = useMemo(() => instructionSteps(exercise.instructions), [exercise.instructions]);

  return (
    <>
      <Page
        title={exercise.title}
        back
        hero={hasMedia ? { height: heroHeight, fadeDistance: 120 } : undefined}
        actions={menu.length > 0 ? <MenuButton onPress={() => setMenuOpen(true)} /> : undefined}
      >
        {({ header, contentContainerStyle, ...scroll }) => (
          <Animated.ScrollView
            {...scroll}
            className="flex-1"
            // The edge-to-edge video hero distorts when Android stretches the overscroll.
            overScrollMode="never"
            showsVerticalScrollIndicator={false}
            contentContainerClassName="gap-6"
            contentContainerStyle={contentContainerStyle}
          >
            {hasMedia ? header : <View className="px-4">{header}</View>}
            {hasMedia ? (
              <VideoHero
                title={exercise.title}
                muscle={exercise.primaryMuscle}
                videoUri={video}
                posterUri={poster}
                width={width}
                height={heroHeight}
              />
            ) : null}
            <View className="gap-3 px-4">
              {hasMedia ? (
                <Text
                  accessibilityRole="header"
                  className="font-semibold text-title-xl text-foreground"
                >
                  {exercise.title}
                </Text>
              ) : null}
              {exercise.aka ? (
                <Text className="text-body text-muted">
                  {t("exercise__aka", { aka: exercise.aka })}
                </Text>
              ) : null}
              <View className="flex-row flex-wrap gap-2">
                <InfoChip label={t(MUSCLE_GROUP_KEYS[exercise.primaryMuscle])} />
                <InfoChip label={t(EQUIPMENT_KEYS[exercise.equipment])} />
                <InfoChip
                  label={t("exercise__logged_as", {
                    type: t(EXERCISE_TYPE_KEYS[exercise.exerciseType]),
                  })}
                />
                {exercise.isFullBodyweight ? (
                  <InfoChip label={t("exercise__full_bodyweight")} />
                ) : null}
              </View>
              {exercise.isArchived ? (
                <Notice
                  status="accent"
                  message={t(
                    exercise.isCustom ? "exercise__detail_archived" : "exercise__detail_retired",
                  )}
                />
              ) : null}
            </View>
            {onAddToWorkout && !exercise.isArchived ? (
              <View className="px-4">
                <Button variant="secondary" onPress={() => onAddToWorkout(exercise.id)}>
                  <Plus size={16} color={foreground} weight="bold" />
                  <Button.Label>{t("training__add_to_workout")}</Button.Label>
                </Button>
              </View>
            ) : null}
            {!hasHistory && steps.length > 0 ? (
              <FormSection steps={steps} collapsible={false} />
            ) : null}
            {hasHistory ? (
              <>
                <ExerciseNumbers
                  sessions={history.sessions}
                  exerciseId={exercise.id}
                  type={exercise.exerciseType}
                  bodyweightKg={preferences.ui.bodyweightKg}
                  unit={preferences.ui.weightUnit}
                  timezone={preferences.timezone}
                />
                <View className="px-4">
                  <RecentSessions
                    sessions={history.sessions.slice(0, 3)}
                    unit={preferences.ui.weightUnit}
                    timezone={preferences.timezone}
                    onSeeAll={onSeeHistory}
                  />
                </View>
              </>
            ) : (
              <Text className="px-4 text-body text-muted">
                {t(
                  history.status === "loading"
                    ? "exercise__history_loading"
                    : history.status === "error"
                      ? "exercise__load_failed"
                      : "exercise__numbers_empty",
                )}
              </Text>
            )}
            <MuscleSection exercise={exercise} onBrowseGroup={onBrowseGroup} />
            {hasHistory && steps.length > 0 ? <FormSection steps={steps} collapsible /> : null}
            <SwapRow candidates={swaps} onOpen={onOpenExercise} />
          </Animated.ScrollView>
        )}
      </Page>
      <ActionSheet
        title={exercise.title}
        actions={menu}
        isOpen={menuOpen}
        onOpenChange={setMenuOpen}
      />
    </>
  );
}

function MenuButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const foreground = useThemeColor("foreground");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("exercise__detail_more")}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center"
    >
      <DotsThreeVertical size={22} weight="bold" color={foreground} />
    </Pressable>
  );
}

function InfoChip({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-default px-3 py-1">
      <Text className="text-label text-foreground">{label}</Text>
    </View>
  );
}

/** The body map with the exercise's groups; tapping a group names it and offers to browse it. */
function MuscleSection({
  exercise,
  onBrowseGroup,
}: {
  exercise: ExerciseDetail;
  onBrowseGroup?: (group: MuscleGroup) => void;
}) {
  const { t } = useTranslation();
  const [tapped, setTapped] = useState<BodyGroup | null>(null);
  const secondary = useMemo(
    () => exercise.secondaryMuscles.filter((group) => group !== exercise.primaryMuscle),
    [exercise.secondaryMuscles, exercise.primaryMuscle],
  );
  const primary = useMemo(() => [exercise.primaryMuscle], [exercise.primaryMuscle]);
  const selected = useMemo(() => (tapped ? [tapped] : []), [tapped]);
  // Cardio, full body and other have no drawing: the map would show a bare body.
  const drawn = primary.some(isBodyGroup) || secondary.some(isBodyGroup);

  const role = (group: MuscleGroup) =>
    group === exercise.primaryMuscle
      ? t("exercise__muscle_primary")
      : secondary.includes(group)
        ? t("exercise__muscle_secondary")
        : t("exercise__muscle_not_worked");

  return (
    <View className="gap-4 px-4">
      <Text accessibilityRole="header" className="font-semibold text-title-md text-foreground">
        {t("exercise__muscles_title")}
      </Text>
      {drawn ? (
        <BodyMapPair
          primary={primary}
          secondary={secondary}
          selected={selected}
          onPressGroup={(group) => {
            haptic.tick();
            setTapped((current) => (current === group ? null : group));
          }}
        />
      ) : null}
      <MuscleLegend
        primary={exercise.primaryMuscle}
        secondary={secondary}
        tapped={tapped}
        role={role}
        onBrowse={onBrowseGroup}
      />
    </View>
  );
}

function MuscleLegend({
  primary,
  secondary,
  tapped,
  role,
  onBrowse,
}: {
  primary: MuscleGroup;
  secondary: readonly MuscleGroup[];
  tapped: BodyGroup | null;
  role: (group: MuscleGroup) => string;
  onBrowse?: (group: MuscleGroup) => void;
}) {
  const { t } = useTranslation();
  // The tapped group, else the muscles the exercise works, so the card never sits empty.
  const shown: readonly MuscleGroup[] = tapped ? [tapped] : [primary, ...secondary];
  return (
    <View className="gap-3">
      {shown.map((group) => (
        <View key={group} className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="font-medium text-body text-foreground">
              {t(MUSCLE_GROUP_KEYS[group])}
            </Text>
            <Text className="text-caption text-muted">{role(group)}</Text>
          </View>
          {onBrowse && tapped !== null && isBodyGroup(group) ? (
            <Button variant="secondary" size="sm" onPress={() => onBrowse(group)}>
              <Button.Label>
                {t("exercise__browse_group", { group: t(MUSCLE_GROUP_KEYS[group]) })}
              </Button.Label>
            </Button>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** The numbered instructions; collapsible (closed) once the user has history with the exercise. */
function FormSection({ steps, collapsible }: { steps: readonly string[]; collapsible: boolean }) {
  const { t } = useTranslation();
  const subtle = useThemeColor("muted");
  const [open, setOpen] = useState(!collapsible);
  return (
    <View className="gap-3 px-4">
      <Pressable
        accessibilityRole={collapsible ? "button" : "header"}
        accessibilityState={collapsible ? { expanded: open } : undefined}
        disabled={!collapsible}
        onPress={() => setOpen((current) => !current)}
        className="flex-row items-center justify-between"
      >
        <Text className="font-semibold text-title-md text-foreground">
          {t("exercise__form_title")}
        </Text>
        {collapsible ? (
          <CaretDown
            size={18}
            color={subtle}
            style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
          />
        ) : null}
      </Pressable>
      {open
        ? steps.map((step, index) => (
            <View
              key={`${index}-${step}`}
              accessible
              accessibilityLabel={t("exercise__form_step", { number: index + 1, text: step })}
              className="flex-row gap-3"
            >
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="size-6 items-center justify-center rounded-full bg-default"
              >
                <Text
                  className="text-caption text-foreground"
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="flex-1 text-body text-foreground"
              >
                {step}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}
