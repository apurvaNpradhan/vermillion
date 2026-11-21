import { nativeColors } from "@workspace/ui/tokens/brand";
import { sessionGoal } from "@workspace/shared";
import { useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { useAppliedVariant } from "@/platform/theme";
import { useToday } from "@/platform/use-today";
import { useActiveSessions } from "@/session";
import { nextWorkoutWidget } from "../../../modules/next-workout-widget";
import { sessionsInWeek } from "../home/home-stats";
import { useHomeTraining } from "../home/use-home-training";
import { useActiveProgram } from "../programs/use-active-program";
import { slotTitle } from "../rotation/rotation-row";
import { useWorkoutRecency } from "../train/use-workout-recency";
import {
  buildWidgetSnapshot,
  sameSnapshotContent,
  weekExpiry,
  type WidgetColors,
  type WidgetInput,
  type WidgetSnapshot,
  type WidgetText,
} from "./widget-snapshot";

/** The theme's own tokens, so the widget follows the selected theme and light or dark. */
function useWidgetColors(): WidgetColors {
  const tokens = nativeColors[useAppliedVariant()];
  return useMemo(
    () => ({
      surface: tokens.surface,
      ink: tokens["text-primary"],
      muted: tokens["text-muted"],
      accent: tokens.action,
      onAccent: tokens["on-action"],
    }),
    [tokens],
  );
}

function useWidgetText(): WidgetText {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      signedOutTitle: t("widget__sign_in"),
      openApp: t("widget__open_app"),
      planWorkout: t("widget__plan"),
      noWorkouts: t("widget__no_workouts"),
      start: t("session__start"),
      resume: t("session__resume"),
      nextWorkout: t("home__next_workout"),
      nextDay: (day, total) => t("home__next_day", { day, total }),
      inProgress: t("home__in_progress"),
      weekHeading: t("home__week"),
      weekLabel: (done, goal) =>
        goal === null
          ? t("widget__week_count", { count: done })
          : t("widget__week_goal", { done, goal }),
    }),
    [t],
  );
}

/**
 * Hands the snapshot to the widget whenever its content changes, and again when the app returns
 * to the foreground (the widget may have been redrawn from an older one meanwhile).
 */
function useWriteSnapshot(snapshot: WidgetSnapshot | null) {
  const latest = useRef(snapshot);
  const written = useRef<WidgetSnapshot | null>(null);
  latest.current = snapshot;
  useEffect(() => {
    if (!snapshot || (written.current && sameSnapshotContent(written.current, snapshot))) return;
    written.current = snapshot;
    nextWorkoutWidget?.setSnapshot(snapshot);
  }, [snapshot]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !latest.current) return;
      written.current = latest.current;
      nextWorkoutWidget?.setSnapshot({ ...latest.current, updatedAt: Date.now() });
    });
    return () => subscription.remove();
  }, []);
}

function SignedOutWidget() {
  const colors = useWidgetColors();
  const text = useWidgetText();
  const snapshot = useMemo(
    () =>
      buildWidgetSnapshot({
        ...EMPTY_INPUT,
        signedIn: false,
        scheme: appConfig.scheme,
        now: Date.now(),
        colors,
        text,
      }),
    [colors, text],
  );
  useWriteSnapshot(snapshot);
  return null;
}

const EMPTY_INPUT = {
  active: null,
  next: null,
  recent: null,
  sessionsThisWeek: 0,
  weekExpiresAt: 0,
  goal: null,
} satisfies Pick<
  WidgetInput,
  "active" | "next" | "recent" | "sessionsThisWeek" | "weekExpiresAt" | "goal"
>;

function SignedInWidget() {
  const colors = useWidgetColors();
  const text = useWidgetText();
  const { t } = useTranslation();
  const home = useHomeTraining();
  const programState = useActiveProgram();
  const recency = useWorkoutRecency();
  const active = useActiveSessions();
  const { now } = useToday(home.timezone);
  const ready =
    !home.loading && !home.failed && !active.loading && programState.ready && !recency.loading;
  const nextSlot = programState.program?.slots.find(
    (slot) => slot.id === programState.progress.next?.id,
  );
  const slots = programState.program?.slots ?? [];
  const recent = recency.value?.[0];
  const resume = active.sessions[0];
  const sessionsThisWeek = sessionsInWeek(home.sessions, now, home.timezone, home.weekStart).length;
  const weekExpiresAt = useMemo(
    () => weekExpiry(now, home.timezone, home.weekStart),
    [now, home.timezone, home.weekStart],
  );
  const goal = sessionGoal(programState.program, home.sessionsPerWeek);
  const nextTitle = nextSlot ? slotTitle(nextSlot, t) : null;
  const nextIndex = nextSlot ? slots.findIndex((slot) => slot.id === nextSlot.id) : -1;
  // Rebuilt every render; the writer skips a snapshot whose content is unchanged.
  const snapshot = ready
    ? buildWidgetSnapshot({
        signedIn: true,
        scheme: appConfig.scheme,
        now: Date.now(),
        colors,
        text,
        active: resume ? { id: resume.id, title: resume.title } : null,
        next:
          nextSlot?.workoutId && nextTitle !== null
            ? {
                workoutId: nextSlot.workoutId,
                title: nextTitle,
                day: nextIndex + 1,
                total: slots.length,
              }
            : null,
        recent: recent ? { workoutId: recent.id, title: recent.title } : null,
        sessionsThisWeek,
        weekExpiresAt,
        goal,
      })
    : null;
  useWriteSnapshot(snapshot);
  return null;
}

/** Mount once at the root: keeps the Android home-screen widget in step with local data. */
export function WidgetHost({ signedIn }: { signedIn: boolean }) {
  if (!nextWorkoutWidget) return null;
  return signedIn ? <SignedInWidget /> : <SignedOutWidget />;
}
