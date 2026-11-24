import {
  DISTANCE_UNITS,
  DURATION_FORMATS,
  PREVIOUS_SOURCES,
  TRAINING_EXPERIENCES,
  TRAINING_EXPERIENCE_HINT_KEYS,
  TRAINING_EXPERIENCE_KEYS,
  TRAINING_PLACES,
  TRAINING_PLACE_KEYS,
  type DistanceUnit,
  type DurationFormat,
  type PreviousSource,
  type TrainingExperience,
  type TrainingPlace,
} from "@workspace/shared";
import { Switch } from "heroui-native";
import {
  Clock,
  Flame,
  House,
  MapPin,
  Rows,
  Timer as TimerIcon,
  User,
  Broadcast,
} from "phosphor-react-native";
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { useRouter } from "expo-router";

import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { ScrollPage } from "@/platform/ui/page";
import { usePreferences } from "@/preferences";
import { useSessionSettings } from "@/session";
import { useTrainingPreferenceRows } from "@/training";

import { workoutLive } from "../../../modules/workout-live";

type Picker = "previous" | "duration" | "distance" | "experience" | "place" | null;

const PREVIOUS_KEYS = {
  any_session: "settings__previous_any",
  same_workout: "settings__previous_same",
} as const satisfies Record<PreviousSource, string>;
const DURATION_KEYS = {
  clock: "settings__duration_clock",
  seconds: "settings__duration_seconds",
} as const satisfies Record<DurationFormat, string>;
const DISTANCE_KEYS = {
  m: "settings__distance_m",
  km: "settings__distance_km",
  mi: "settings__distance_mi",
} as const satisfies Record<DistanceUnit, string>;

/**
 * Workout settings, pushed from Settings: logging (rest, effort scale, previous values, warm-ups,
 * units for time and distance), the weekly plan, equipment, sounds, and how a workout behaves
 * while it runs. The same account preferences as the Session's own settings sheet.
 */
export function WorkoutSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { preferences, setUi } = usePreferences();
  const sessionSettings = useSessionSettings();
  const training = useTrainingPreferenceRows();
  const [picker, setPicker] = useState<Picker>(null);
  const [promotion, setPromotion] = useState(() => workoutLive?.promotionStatus() ?? "unsupported");
  useEffect(() => {
    const refresh = () => setPromotion(workoutLive?.promotionStatus() ?? "unsupported");
    refresh();
    const subscription = AppState.addEventListener("change", refresh);
    return () => subscription.remove();
  }, []);
  const {
    previousSource,
    countWarmups,
    durationFormat,
    distanceUnit,
    trainingExperience,
    trainingPlace,
  } = preferences.ui;
  const onOpenChange = (open: boolean) => {
    if (!open) setPicker(null);
  };

  return (
    <>
      {training.sheets}
      <ScrollPage title={t("settings__workouts_screen")} back backFallback="/settings">
        <ListSection title={t("settings__logging")}>
          {training.rows.rest}
          {training.rows.effort}
          {training.rows.increment}
          <ListRow
            icon={Clock}
            title={t("settings__previous_title")}
            value={t(PREVIOUS_KEYS[previousSource])}
            onPress={() => setPicker("previous")}
          />
          <ListRow
            icon={Flame}
            title={t("settings__count_warmups")}
            description={t("settings__count_warmups_hint")}
            accessory="none"
            checked={countWarmups}
            onPress={() => setUi({ countWarmups: !countWarmups })}
            trailing={
              <Switch
                accessibilityLabel={t("settings__count_warmups")}
                isSelected={countWarmups}
                onSelectedChange={(value) => setUi({ countWarmups: value })}
              />
            }
          />
          <ListRow
            icon={Rows}
            title={t("settings__warmup_title")}
            onPress={() => router.push("/settings/warmups")}
          />
          <ListRow
            icon={TimerIcon}
            title={t("settings__duration_title")}
            value={t(DURATION_KEYS[durationFormat])}
            onPress={() => setPicker("duration")}
          />
          <ListRow
            icon={MapPin}
            title={t("settings__distance_title")}
            value={t(DISTANCE_KEYS[distanceUnit])}
            onPress={() => setPicker("distance")}
          />
          {training.rows.equipment}
        </ListSection>
        <ListSection title={t("settings__plan")}>
          {training.rows.sessions}
          {training.rows.weekStart}
          <ListRow
            icon={User}
            title={t("settings__experience_title")}
            value={
              trainingExperience === null
                ? undefined
                : t(TRAINING_EXPERIENCE_KEYS[trainingExperience])
            }
            onPress={() => setPicker("experience")}
          />
          <ListRow
            icon={House}
            title={t("settings__place_title")}
            value={trainingPlace === null ? undefined : t(TRAINING_PLACE_KEYS[trainingPlace])}
            onPress={() => setPicker("place")}
          />
        </ListSection>
        <ListSection title={t("session__setting_sounds")}>{sessionSettings.soundRows}</ListSection>
        <ListSection title={t("settings__during_workout")}>
          {sessionSettings.rows}
          {Platform.OS === "android" ? (
            <ListRow
              icon={Broadcast}
              title={t("session__live_setting")}
              value={t(
                promotion === "unsupported"
                  ? "session__live_unsupported"
                  : promotion === "granted"
                    ? "session__setting_on"
                    : "session__setting_off",
              )}
              onPress={() => workoutLive?.openPromotionSettings()}
            />
          ) : null}
        </ListSection>
      </ScrollPage>
      <OptionSheet<PreviousSource>
        isOpen={picker === "previous"}
        onOpenChange={onOpenChange}
        title={t("settings__previous_title")}
        description={t("settings__previous_hint")}
        options={PREVIOUS_SOURCES.map((value) => ({ value, label: t(PREVIOUS_KEYS[value]) }))}
        value={previousSource}
        onSelect={(value) => setUi({ previousSource: value })}
      />
      <OptionSheet<DurationFormat>
        isOpen={picker === "duration"}
        onOpenChange={onOpenChange}
        title={t("settings__duration_title")}
        description={t("settings__duration_hint")}
        options={DURATION_FORMATS.map((value) => ({ value, label: t(DURATION_KEYS[value]) }))}
        value={durationFormat}
        onSelect={(value) => setUi({ durationFormat: value })}
      />
      <OptionSheet<TrainingExperience>
        isOpen={picker === "experience"}
        onOpenChange={onOpenChange}
        title={t("settings__experience_title")}
        description={t("settings__experience_hint")}
        options={TRAINING_EXPERIENCES.map((value) => ({
          value,
          label: t(TRAINING_EXPERIENCE_KEYS[value]),
          description: t(TRAINING_EXPERIENCE_HINT_KEYS[value]),
        }))}
        value={trainingExperience}
        onSelect={(value) => setUi({ trainingExperience: value })}
      />
      <OptionSheet<TrainingPlace>
        isOpen={picker === "place"}
        onOpenChange={onOpenChange}
        title={t("settings__place_title")}
        description={t("settings__place_hint")}
        options={TRAINING_PLACES.map((value) => ({ value, label: t(TRAINING_PLACE_KEYS[value]) }))}
        value={trainingPlace}
        onSelect={(value) => setUi({ trainingPlace: value })}
      />
      <OptionSheet<DistanceUnit>
        isOpen={picker === "distance"}
        onOpenChange={onOpenChange}
        title={t("settings__distance_title")}
        description={t("settings__distance_hint")}
        options={DISTANCE_UNITS.map((value) => ({ value, label: t(DISTANCE_KEYS[value]) }))}
        value={distanceUnit}
        onSelect={(value) => setUi({ distanceUnit: value })}
      />
    </>
  );
}
