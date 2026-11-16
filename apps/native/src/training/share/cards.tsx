import { View } from "react-native";
import type { MuscleLoad } from "@workspace/shared";
import type { WorkoutDetail, ProgramPlan } from "@workspace/sync";
import { BodyMapPair, isBodyGroup, type BodyGroup } from "@/body-map";
import { ExerciseThumbnail } from "@/exercise";
import { MediaImage } from "@/media";
import { CardText, useImageSettle, type CardContext } from "@/share";
import { useTranslation } from "@/platform/i18n";
import { displayTitle } from "../derived-title";
import { estimateMinutes } from "../estimate";
import { summariseWorking, type SummaryLabels, type SummaryPrefs } from "../summarise-sets";
import { cardRows, daysPerWeek, planLoads, setCounts } from "./plan-data";

export function PlanMap({ loads, width }: { loads: MuscleLoad[]; width: number }) {
  const max = loads[0]?.sets ?? 0;
  const intensity: Partial<Record<BodyGroup, number>> = {};
  for (const load of loads)
    if (isBodyGroup(load.muscle) && max > 0) intensity[load.muscle] = load.sets / max;
  return (
    <BodyMapPair intensity={intensity} gap={20} maxFigureWidth={width / 2} style={{ width }} />
  );
}

export function WorkoutCard({
  workout,
  label,
  context,
  prefs,
  labels,
}: {
  workout: WorkoutDetail;
  label?: string;
  context: CardContext<"weights">;
  prefs: SummaryPrefs;
  labels: SummaryLabels;
}) {
  const { t } = useTranslation();
  const { palette, toggles } = context;
  const title = displayTitle(
    workout.title,
    workout.exercises.flatMap((entry) => (entry.exercise ? [entry.exercise.primaryMuscle] : [])),
    (key) => t(key),
  );
  const rows = cardRows(workout.exercises);
  const compact = rows.items.length > 9;
  const height = compact ? 82 : rows.items.length > 6 ? 106 : 142;
  const working = workout.exercises.reduce((sum, entry) => sum + setCounts(entry.sets).working, 0);
  return (
    <View style={{ flex: 1 }}>
      {label ? (
        <CardText size={32} color={palette.textSecondary} lines={1}>
          {label}
        </CardText>
      ) : null}
      <CardText
        size={86}
        lineHeight={92}
        weight="bold"
        tracking={-1.7}
        color={palette.text}
        lines={2}
      >
        {title}
      </CardText>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginVertical: 24,
        }}
      >
        <View style={{ flex: 1, gap: 12 }}>
          <CardText size={32} color={palette.textSecondary} tabular>
            {t("share__plan_counts", {
              exercises: t("share__plan_exercises", { count: workout.exercises.length }),
              sets: t("share__plan_working", { count: working }),
            })}
          </CardText>
          <CardText size={58} weight="semibold" color={palette.text} tabular>
            {t("share__plan_minutes", { minutes: estimateMinutes(workout.exercises) })}
          </CardText>
        </View>
        <PlanMap loads={planLoads([workout])} width={200} />
      </View>
      <View style={{ borderTopWidth: 2, borderTopColor: palette.hairline }}>
        {rows.items.map(({ entry, place }) => {
          const name = entry.exercise?.title ?? t("training__exercise_missing");
          const summary = summariseWorking(
            entry.sets,
            entry.exercise?.exerciseType ?? "weight_reps",
            prefs,
            labels,
          );
          const detail = [summary.text, toggles.weights ? summary.weight : null, summary.effort]
            .filter((part) => part !== null)
            .join(" · ");
          const warmup = setCounts(entry.sets).warmup;
          return (
            <View
              key={entry.id}
              style={{
                height,
                flexDirection: "row",
                alignItems: "center",
                gap: 22,
                paddingLeft: 24,
              }}
            >
              {place !== "none" ? (
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    width: 5,
                    top: place === "first" ? 12 : 0,
                    bottom: place === "last" ? 12 : 0,
                    borderRadius: 3,
                    backgroundColor: palette.accent,
                  }}
                />
              ) : null}
              <PlanThumbnail name={name} entry={entry} size={compact ? 54 : 72} palette={palette} />
              <View style={{ flex: 1 }}>
                <CardText size={compact ? 30 : 38} weight="semibold" color={palette.text} lines={1}>
                  {name}
                </CardText>
                <CardText size={compact ? 25 : 30} color={palette.textSecondary} tabular lines={1}>
                  {detail}
                </CardText>
              </View>
              {warmup > 0 ? (
                <CardText size={compact ? 22 : 26} color={palette.textMuted} lines={1}>
                  {t("share__plan_warmup", { count: warmup })}
                </CardText>
              ) : null}
            </View>
          );
        })}
        {rows.more > 0 ? (
          <CardText size={30} color={palette.textMuted}>
            {t("share__more", { count: rows.more })}
          </CardText>
        ) : null}
      </View>
    </View>
  );
}

/** Each thumbnail registers independently, so capture waits for every visible local image. */
function PlanThumbnail({
  name,
  entry,
  size,
  palette,
}: {
  name: string;
  entry: WorkoutDetail["exercises"][number];
  size: number;
  palette: CardContext<"weights">["palette"];
}) {
  const settle = useImageSettle();
  return (
    <ExerciseThumbnail
      localOnly
      title={name}
      thumbnailKey={entry.exercise?.thumbnailKey ?? null}
      imageMediaId={entry.exercise?.imageMediaId ?? null}
      size={size}
      plate={{ background: palette.plate, ink: palette.textSecondary }}
      onSettled={settle}
    />
  );
}

export function ProgramOverview({
  plan,
  context,
}: {
  plan: ProgramPlan;
  context: CardContext<"weights">;
}) {
  const { t } = useTranslation();
  const { palette } = context;
  const titleOf = (workout: WorkoutDetail) =>
    displayTitle(
      workout.title,
      workout.exercises.flatMap((entry) => (entry.exercise ? [entry.exercise.primaryMuscle] : [])),
      (key) => t(key),
    );
  const dense = plan.slots.length > 12;
  return (
    <View style={{ flex: 1, gap: dense ? 24 : 40 }}>
      <CardText size={32} tracking={3} upper color={palette.textSecondary}>
        {t("share__plan_overview")}
      </CardText>
      <CardText
        size={96}
        lineHeight={104}
        weight="bold"
        tracking={-1.9}
        color={palette.text}
        lines={2}
      >
        {plan.title}
      </CardText>
      <CardText size={38} color={palette.textSecondary} tabular>
        {plan.plannedWeeks === null
          ? t("share__plan_days", { count: daysPerWeek(plan.slots) })
          : t("share__plan_schedule", {
              weeks: t("share__plan_weeks", { count: plan.plannedWeeks }),
              days: t("share__plan_days", { count: daysPerWeek(plan.slots) }),
            })}
      </CardText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: dense ? 12 : 16 }}>
        {plan.slots.map((slot, index) => (
          <View
            key={index}
            style={{
              width: 208,
              padding: dense ? 10 : 20,
              gap: dense ? 4 : 10,
              borderRadius: 20,
              backgroundColor: palette.plate,
            }}
          >
            <CardText size={dense ? 22 : 26} color={palette.textMuted} tabular>
              {t("share__plan_day_number", { day: index + 1 })}
            </CardText>
            <CardText size={dense ? 24 : 30} weight="semibold" color={palette.text} lines={1}>
              {slot.workout ? titleOf(slot.workout) : t("training__rest_day")}
            </CardText>
          </View>
        ))}
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <PlanMap
          loads={planLoads(plan.slots.flatMap((slot) => (slot.workout ? [slot.workout] : [])))}
          width={dense ? 330 : 460}
        />
      </View>
    </View>
  );
}

/** A Program cover is always available, with no Session photo privacy gate. */
export function ProgramCover({ mediaId }: { mediaId: string }) {
  const settle = useImageSettle();
  return (
    <MediaImage
      mediaId={mediaId}
      variant="full"
      localOnly
      size={1080}
      height={1920}
      rounded="rounded-none"
      onSettled={settle}
    />
  );
}
