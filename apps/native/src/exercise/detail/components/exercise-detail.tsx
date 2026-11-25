import { MediaImage } from "@/media";
import {
  EQUIPMENT_KEYS,
  EXERCISE_TYPE_KEYS,
  hasWarmupRamp,
  MUSCLE_DETAIL_KEYS,
  MUSCLE_DETAILS,
  MUSCLE_GROUP_KEYS,
  type MuscleDetail,
  type MuscleGroup,
} from "@workspace/shared";
import type { ExerciseDetail } from "@workspace/sync";
import { Switch, useThemeColor } from "heroui-native";
import {
  Archive,
  ArrowCounterClockwise,
  CaretDown,
  DotsThreeVertical,
  Info,
  PencilSimple,
  FireSimple,
  PushPin,
  Plus,
  SlidersHorizontal,
} from "phosphor-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";

import { BodyMapPair, isBodyGroup, type BodyGroup } from "@/body-map";
import { usePreferences } from "@/preferences";
import { ExerciseNumbers } from "./exercise-numbers";
import { RecentTopSets } from "./recent-top-sets";
import { appConfig } from "@/platform/app-config";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { ListRow, ListSection } from "@/platform/ui/list";
import { GymLimitRows } from "@/gym";
import { Notice } from "@/platform/ui/notice";
import { Page, ScrollPage } from "@/platform/ui/page";
import type { SwipeAction } from "@/platform/ui/swipe-row";

import { thumbnailUrl, videoUrl } from "../../media-url";
import { instructionSteps } from "../instruction-steps";
import { useExercise, useSwapCandidates } from "../use-exercise";
import { useExerciseActions } from "../../use-exercise-actions";
import { useExerciseAutoWarmups, useExerciseProgressionMode } from "../use-exercise-progression";
import { useExerciseHistory } from "../use-exercise-history";
import { useExerciseNote } from "../use-exercise-note";
import { PinnedNoteSheet } from "../../components/pinned-note-sheet";
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
        {null}
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
          <Text className="font-normal px-4 text-center text-caption text-muted">
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
  const mode = useExerciseProgressionMode(exercise.id);
  const { setProgressionPerSet, setAutoWarmups, setPinnedNote, setExercisePinned } =
    useExerciseActions();
  const pinned = useExerciseNote(exercise.id);
  const [noteOpen, setNoteOpen] = useState(false);
  const autoWarmups = useExerciseAutoWarmups(exercise.id);
  const canSetWarmups = !exercise.isArchived && hasWarmupRamp(exercise.exerciseType);
  const warmupsOn = autoWarmups.value ?? false;
  const canSetProgression =
    !exercise.isArchived &&
    (exercise.exerciseType === "weight_reps" ||
      exercise.exerciseType === "bodyweight_weighted_reps");
  const perSet = mode.value ?? false;
  const { preferences, timeZone } = usePreferences();
  const hasHistory = history.status === "ready" && history.sessions.length > 0;
  const swaps = useSwapCandidates(exercise);
  const foreground = useThemeColor("foreground");
  const [menuOpen, setMenuOpen] = useState(false);

  const video = videoUrl(appConfig.urls.exerciseMedia, exercise.videoKey);
  const poster = thumbnailUrl(appConfig.urls.exerciseMedia, exercise.thumbnailKey);
  const hasMedia = video !== null || poster !== null || !!exercise.imageMediaId;
  const heroHeight = Math.round(
    width * (hasHistory ? HERO_RATIO_WITH_HISTORY : HERO_RATIO_CATALOG),
  );

  const menu = useMemo<SwipeAction[]>(() => {
    const items: SwipeAction[] = [];
    if (canSetProgression && !mode.loading && !mode.failed) {
      items.push({
        key: "progression",
        label: t(
          perSet ? "exercise__progression_use_straight" : "exercise__progression_use_per_set",
        ),
        icon: SlidersHorizontal,
        onPress: () => void setProgressionPerSet(exercise.id, !perSet).catch(() => undefined),
      });
    }
    if (!exercise.isCustom) return items;
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
    canSetProgression,
    mode.loading,
    mode.failed,
    perSet,
    setProgressionPerSet,
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
            {exercise.imageMediaId ? (
              <View className="items-center">
                <MediaImage mediaId={exercise.imageMediaId} size={width} />
              </View>
            ) : hasMedia ? (
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
                <Text className="font-normal text-body text-muted">
                  {t("exercise__aka", { aka: exercise.aka })}
                </Text>
              ) : null}
              <View className="flex-row items-center gap-4">
                <View className="min-w-0 flex-1 flex-row flex-wrap gap-2">
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
                <MiniMuscleMap exercise={exercise} />
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
                  <Plus size={20} color={foreground} />
                  <Button.Label>{t("training__add_to_workout")}</Button.Label>
                </Button>
              </View>
            ) : null}
            {!exercise.isArchived || exercise.isPinned ? (
              <View className="px-4">
                <Button
                  variant="secondary"
                  accessibilityState={{ selected: exercise.isPinned }}
                  onPress={() =>
                    void setExercisePinned(exercise.id, !exercise.isPinned).catch(() => undefined)
                  }
                >
                  <PushPin
                    size={20}
                    color={foreground}
                    weight={exercise.isPinned ? "fill" : "regular"}
                  />
                  <Button.Label>
                    {t(exercise.isPinned ? "exercise__unpin" : "exercise__pin")}
                  </Button.Label>
                </Button>
              </View>
            ) : null}
            {!exercise.isArchived && !pinned.loading && !pinned.failed ? (
              <View className="px-4">
                <ListSection title={t("exercise__pinned_note")}>
                  <ListRow
                    icon={PushPin}
                    title={pinned.value ?? t("exercise__pinned_note_add")}
                    description={
                      pinned.value === null ? t("exercise__pinned_note_hint") : undefined
                    }
                    onPress={() => setNoteOpen(true)}
                  />
                </ListSection>
              </View>
            ) : null}
            {hasHistory ? (
              <>
                <ExerciseNumbers
                  sessions={history.sessions}
                  exerciseId={exercise.id}
                  type={exercise.exerciseType}
                  equipment={exercise.equipment}
                  weightIncrementKg={preferences.ui.weightIncrementKg}
                  progressionPerSet={perSet}
                  bodyweightKg={preferences.ui.bodyweightKg}
                  unit={preferences.ui.weightUnit}
                  timezone={timeZone}
                  weekStart={preferences.ui.weekStart}
                />
                <View className="px-4">
                  <RecentTopSets
                    sessions={history.sessions.slice(0, 3)}
                    exerciseId={exercise.id}
                    type={exercise.exerciseType}
                    unit={preferences.ui.weightUnit}
                    timezone={timeZone}
                    onSeeAll={onSeeHistory}
                  />
                </View>
              </>
            ) : history.status === "loading" ? null : (
              <Text className="font-normal px-4 text-body text-muted">
                {t(
                  history.status === "error" ? "exercise__load_failed" : "exercise__numbers_empty",
                )}
              </Text>
            )}
            {canSetWarmups && !autoWarmups.loading && !autoWarmups.failed ? (
              <View className="px-4">
                <ListSection title={t("exercise__settings")}>
                  <ListRow
                    icon={FireSimple}
                    title={t("exercise__auto_warmups")}
                    description={t("exercise__auto_warmups_hint")}
                    accessory="none"
                    checked={warmupsOn}
                    onPress={() =>
                      void setAutoWarmups(exercise.id, !warmupsOn).catch(() => undefined)
                    }
                    trailing={
                      <Switch
                        accessibilityLabel={t("exercise__auto_warmups")}
                        isSelected={warmupsOn}
                        onSelectedChange={(on) =>
                          void setAutoWarmups(exercise.id, on).catch(() => undefined)
                        }
                      />
                    }
                  />
                </ListSection>
              </View>
            ) : null}
            {!exercise.isArchived &&
            (exercise.exerciseType === "weight_reps" ||
              exercise.exerciseType === "bodyweight_weighted_reps") ? (
              <View className="px-4">
                <GymLimitRows
                  exerciseId={exercise.id}
                  title={exercise.title}
                  equipment={exercise.equipment}
                  unit={preferences.ui.weightUnit}
                />
              </View>
            ) : null}
            <SwapRow candidates={swaps} onOpen={onOpenExercise} />
            <MuscleSection exercise={exercise} onBrowseGroup={onBrowseGroup} />
            {steps.length > 0 ? <FormSection steps={steps} /> : null}
          </Animated.ScrollView>
        )}
      </Page>
      <ActionSheet
        title={exercise.title}
        actions={menu}
        isOpen={menuOpen}
        onOpenChange={setMenuOpen}
      />
      <PinnedNoteSheet
        isOpen={noteOpen}
        onOpenChange={setNoteOpen}
        title={exercise.title}
        value={pinned.value ?? null}
        onSave={(note) => void setPinnedNote(exercise.id, note).catch(() => undefined)}
      />
    </>
  );
}

/** A small, quiet body map at the top: the muscles the exercise works, front and back. */
function MiniMuscleMap({ exercise }: { exercise: ExerciseDetail }) {
  const secondary = useMemo(
    () => exercise.secondaryMuscles.filter((group) => group !== exercise.primaryMuscle),
    [exercise.secondaryMuscles, exercise.primaryMuscle],
  );
  const primary = useMemo(() => [exercise.primaryMuscle], [exercise.primaryMuscle]);
  const details = useMemo(
    () => [...exercise.primaryDetail, ...exercise.secondaryDetail],
    [exercise.primaryDetail, exercise.secondaryDetail],
  );
  if (!primary.some(isBodyGroup) && !secondary.some(isBodyGroup)) return null;
  return (
    <View className="w-24">
      <BodyMapPair primary={primary} secondary={secondary} details={details} gap={4} />
    </View>
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
      <DotsThreeVertical size={24} color={foreground} />
    </Pressable>
  );
}

function InfoChip({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-default px-3 py-1">
      <Text className="font-medium text-label text-foreground">{label}</Text>
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
  // An exercise with details lights only those parts; a group without any lights whole.
  const details = useMemo(
    () => [...exercise.primaryDetail, ...exercise.secondaryDetail],
    [exercise.primaryDetail, exercise.secondaryDetail],
  );
  // Cardio, full body and other have no drawing: the map would show a bare body.
  const drawn = primary.some(isBodyGroup) || secondary.some(isBodyGroup);

  return (
    <CollapsibleSection title={t("exercise__muscles_title")}>
      {drawn ? (
        <BodyMapPair
          primary={primary}
          secondary={secondary}
          details={details}
          onPressGroup={(group) => {
            haptic.tick();
            setTapped((current) => (current === group ? null : group));
          }}
        />
      ) : null}
      <MuscleBreakdown
        primary={exercise.primaryMuscle}
        secondary={secondary}
        primaryDetail={exercise.primaryDetail}
        secondaryDetail={exercise.secondaryDetail}
        tapped={tapped}
        onBrowse={onBrowseGroup}
      />
    </CollapsibleSection>
  );
}

type BreakdownRow = {
  group: MuscleGroup;
  /** The parts of the group the exercise works; empty when the whole group is meant. */
  parts: readonly MuscleDetail[];
};

/** One row per group, in order, each with the parts of it that are listed. */
function breakdownRows(
  groups: readonly MuscleGroup[],
  details: readonly MuscleDetail[],
  taken: ReadonlySet<MuscleGroup>,
): BreakdownRow[] {
  const ordered = [...groups];
  for (const detail of details) {
    const group: MuscleGroup = MUSCLE_DETAILS[detail];
    if (!ordered.includes(group) && !taken.has(group)) ordered.push(group);
  }
  return ordered.map((group) => ({
    group,
    parts: details.filter((detail) => MUSCLE_DETAILS[detail] === group),
  }));
}

function MuscleBreakdown({
  primary,
  secondary,
  primaryDetail,
  secondaryDetail,
  tapped,
  onBrowse,
}: {
  primary: MuscleGroup;
  secondary: readonly MuscleGroup[];
  primaryDetail: readonly MuscleDetail[];
  secondaryDetail: readonly MuscleDetail[];
  tapped: BodyGroup | null;
  onBrowse?: (group: MuscleGroup) => void;
}) {
  const { t } = useTranslation();
  const primaryRows = breakdownRows([primary], primaryDetail, new Set());
  const taken = new Set(primaryRows.map((row) => row.group));
  const secondaryRows = breakdownRows(
    secondary.filter((group) => !taken.has(group)),
    secondaryDetail,
    taken,
  );
  const rows = [...primaryRows, ...secondaryRows];
  const shown = tapped ? rows.filter((row) => row.group === tapped) : rows;
  const browse = tapped !== null && shown.length > 0 ? onBrowse : undefined;
  return (
    <View className="gap-2">
      <View className="rounded-xl bg-surface px-3 py-1">
        {shown.map(({ group, parts }) => {
          const isPrimary = taken.has(group);
          return (
            <View key={group} className="flex-row items-start gap-3 py-2">
              <View
                className={`mt-1.5 size-2.5 rounded-full bg-danger ${isPrimary ? "" : "opacity-45"}`}
              />
              <View className="flex-1">
                <Text className="font-medium text-body text-foreground">
                  {t(MUSCLE_GROUP_KEYS[group])}
                </Text>
                {parts.length > 0 ? (
                  <Text className="font-normal text-caption text-muted">
                    {parts.map((part) => t(MUSCLE_DETAIL_KEYS[part])).join(" · ")}
                  </Text>
                ) : null}
              </View>
              <Text className="shrink text-right font-normal text-caption text-muted">
                {t(isPrimary ? "exercise__muscle_primary" : "exercise__muscle_secondary")}
              </Text>
            </View>
          );
        })}
      </View>
      {browse && tapped !== null ? (
        <Button variant="secondary" size="sm" onPress={() => browse(tapped)}>
          <Button.Label>
            {t("exercise__browse_group", { group: t(MUSCLE_GROUP_KEYS[tapped]) })}
          </Button.Label>
        </Button>
      ) : null}
    </View>
  );
}

/** A titled section, closed at first, that opens and closes; the title row is the toggle. */
function CollapsibleSection({ title, children }: { title: string; children: ReactNode }) {
  const subtle = useThemeColor("muted");
  const [open, setOpen] = useState(false);
  return (
    <View className="gap-3 px-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        className="min-h-11 flex-row items-center justify-between"
      >
        <Text accessibilityRole="header" className="font-semibold text-title-md text-foreground">
          {title}
        </Text>
        <CaretDown
          size={20}
          color={subtle}
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        />
      </Pressable>
      {open ? <View className="gap-4">{children}</View> : null}
    </View>
  );
}

/** The numbered instructions, closed until asked for. */
function FormSection({ steps }: { steps: readonly string[] }) {
  const { t } = useTranslation();
  return (
    <CollapsibleSection title={t("exercise__form_title")}>
      {steps.map((step, index) => (
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
              className="font-normal text-caption text-foreground"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {index + 1}
            </Text>
          </View>
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="font-normal flex-1 text-body text-foreground"
          >
            {step}
          </Text>
        </View>
      ))}
    </CollapsibleSection>
  );
}
