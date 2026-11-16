import { useWeight } from "@/body";
import { MUSCLE_GROUP_KEYS, recordFlags } from "@workspace/shared";
import type { ShareTemplate, ShareToggle, SharePhoto } from "@/share";
import { useTranslation } from "@/platform/i18n";
import { usePreferences } from "@/preferences";

import { formatVolume } from "./summary";
import { buildCardData, type SessionCardLabels, type SessionToggleId } from "./share/card-data";
import { MusclesCard, PhotoCard, SessionPhotoLayer, StickerCard, SummaryCard } from "./share/cards";
import { timeOfDay } from "./share/time-of-day";
import { useSession } from "./use-session";
import { useSessionPhotoList } from "./use-session-photos";
import { useRecordHistory } from "./use-session-history";

export type SessionShare =
  | { status: "loading" | "missing" }
  | { status: "error"; retry: () => void }
  | {
      status: "ready";
      templates: ShareTemplate<SessionToggleId>[];
      toggles: ShareToggle<SessionToggleId>[];
      photo: SharePhoto<SessionToggleId> | undefined;
    };

/**
 * Everything the Share composer needs for a Session (ADR 0042): its templates, privacy toggles
 * and photo. The templates read the Session through the same helpers as the detail screen (totals,
 * Record flags, Muscle distribution), so a card and its Session agree.
 */
export function useSessionShare(id: string): SessionShare {
  const { t, i18n } = useTranslation();
  const state = useSession(id);
  const session = state.status === "ready" ? state.session : null;
  const history = useRecordHistory(
    session ? session.exercises.map((entry) => entry.exerciseId) : [],
  );
  const photos = useSessionPhotoList(id);
  const weight = useWeight();
  const { preferences } = usePreferences();

  if (state.status === "error") return state;
  if (!session) return { status: state.status === "missing" ? "missing" : "loading" };
  if (history.loading || photos.loading) return { status: "loading" };

  const unit = preferences.ui.weightUnit;
  const unitLabel = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
  const timeZone = preferences.timezone ?? null;
  const bodyweightKg = weight.bodyweightOn(session.startedAt);
  // A failed Record history leaves the Records out rather than the card unshared.
  const flagged = history.failed
    ? new Map<string, never>()
    : recordFlags(history.sessions, bodyweightKg);
  const distribution = session.exercises.flatMap((entry) =>
    entry.exercise
      ? [
          {
            id: entry.exerciseId,
            primary_muscle: entry.exercise.primaryMuscle,
            secondary_muscles: entry.exercise.secondaryMuscles,
          },
        ]
      : [],
  );
  const reps = (count: number) => t("share__reps", { count });
  const labels: SessionCardLabels = {
    unit,
    unitLabel,
    reps,
    distance: (meters) => t("share__distance", { value: Number(meters.toFixed(1)) }),
    floors: (count) => t("share__floors", { count }),
    steps: (count) => t("share__steps", { count }),
    repRange: (min, max) => (min === max ? reps(min) : t("share__rep_range", { min, max })),
    weightReps: (value, count) =>
      t("share__weight_reps", { weight: value, unit: unitLabel, reps: count }),
    date: (startedAt) =>
      t("share__session_date", {
        date: new Intl.DateTimeFormat(i18n.language, {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: timeZone ?? undefined,
        }).format(new Date(startedAt)),
        part: t(`share__part_${timeOfDay(startedAt, timeZone)}`),
      }),
    statLabel: (stat) => t(`stats__${stat}`),
    volume: (kg) => ({ value: formatVolume(kg, unit, i18n.language), unit: unitLabel }),
    records: (count) => t("share__records", { count }),
    rowSummary: (sets, detail, kind) =>
      t(kind === "best" ? "share__row_best" : "share__row_range", {
        sets: t("share__sets", { count: sets }),
        detail,
      }),
    more: (count) => t("share__more", { count }),
    muscleName: (muscle) => t(MUSCLE_GROUP_KEYS[muscle]),
    muscleSets: (sets) => t("share__muscle_sets", { count: Number(sets.toFixed(1)) }),
  };

  const firstPhoto = photos.value?.[0]?.media_id ?? null;
  const dataFor = (toggles: Readonly<Record<SessionToggleId, boolean>>) =>
    buildCardData({ session, flagged, bodyweightKg, distribution, toggles, labels });
  const templates: ShareTemplate<SessionToggleId>[] = [
    {
      id: "summary",
      label: t("share__template_summary"),
      supportsTransparent: false,
      render: (context) => <SummaryCard data={dataFor(context.toggles)} context={context} />,
    },
    {
      id: "muscles",
      label: t("share__template_muscles"),
      supportsTransparent: false,
      render: (context) => <MusclesCard data={dataFor(context.toggles)} context={context} />,
    },
    ...(firstPhoto
      ? [
          {
            id: "photo",
            label: t("share__template_photo"),
            supportsTransparent: false,
            requires: "photo" as const,
            fixedBackground: "photo" as const,
            render: (context) => <PhotoCard data={dataFor(context.toggles)} context={context} />,
          } satisfies ShareTemplate<SessionToggleId>,
        ]
      : []),
    {
      id: "sticker",
      label: t("share__template_sticker"),
      supportsTransparent: true,
      render: (context) => <StickerCard data={dataFor(context.toggles)} context={context} />,
    },
  ];
  const toggles: ShareToggle<SessionToggleId>[] = [
    { id: "weights", label: t("share__toggle_weights"), defaultOn: true, remember: true },
    { id: "exercises", label: t("share__toggle_exercises"), defaultOn: true, remember: true },
    ...(firstPhoto
      ? [
          {
            id: "photo" as const,
            label: t("share__toggle_photo"),
            defaultOn: false,
            remember: false,
          },
        ]
      : []),
  ];
  return {
    status: "ready",
    templates,
    toggles,
    photo: firstPhoto
      ? { requires: "photo", render: () => <SessionPhotoLayer mediaId={firstPhoto} /> }
      : undefined,
  };
}
