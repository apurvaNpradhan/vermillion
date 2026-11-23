import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { usePreferences } from "@/preferences";
import { useActiveSessions } from "@/session/lifecycle/use-active-sessions";
import { useInstallId } from "@/session/shared/use-install-id";
import { useSession } from "@/session/screen/use-session";
import { useNotificationPermission } from "@/platform/notifications/permission-store";
import { dismissWorkoutLive, refreshWorkoutLive, resumeWorkoutLiveRefresh } from "./workout-live";
import { restSoundOn } from "@/session/settings/rest-sound";

function SessionLive({ id, installId }: { id: string | null; installId: string }) {
  const state = useSession(id);
  const permission = useNotificationPermission();
  const { preferences } = usePreferences();
  const { weightUnit, weightIncrementKg, lighterWeeks, sounds, soundRest } = preferences.ui;
  const soundOn = restSoundOn({ sounds, soundRest });
  const session = state.status === "ready" ? state.session : null;
  const loading = id !== null && state.status === "loading";
  // A different Session or a new install invalidates in-flight work for the old one.
  useEffect(() => dismissWorkoutLive, [id, installId]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") resumeWorkoutLiveRefresh();
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (loading || permission === "unknown") return;
    if (
      permission !== "granted" ||
      !session ||
      session.finishedAt !== null ||
      session.deviceId !== installId
    ) {
      dismissWorkoutLive();
      return;
    }
    refreshWorkoutLive(session, { weightUnit, weightIncrementKg, lighterWeeks, soundOn });
  }, [
    loading,
    session,
    installId,
    permission,
    weightUnit,
    weightIncrementKg,
    lighterWeeks,
    soundOn,
  ]);
  return null;
}
export function WorkoutLiveHost() {
  const { sessions, loading } = useActiveSessions();
  const installId = useInstallId();
  if (Platform.OS !== "android" || loading || !installId) return null;
  return (
    <SessionLive
      id={sessions.find((session) => session.deviceId === installId)?.id ?? null}
      installId={installId}
    />
  );
}
