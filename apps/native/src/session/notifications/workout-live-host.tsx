import { useEffect } from "react";
import { Platform } from "react-native";
import { usePreferences } from "@/preferences";
import { useActiveSessions } from "@/session/lifecycle/use-active-sessions";
import { useInstallId } from "@/session/shared/use-install-id";
import { useSession } from "@/session/screen/use-session";
import { useNotificationPermission } from "@/platform/notifications/permission-store";
import { refreshWorkoutLive } from "./workout-live";
import { restSoundOn } from "@/session/settings/rest-sound";

function SessionLive({ id, installId }: { id: string | null; installId: string }) {
  // The shared watch: the same parse the Session screen reads, not a query of its own.
  const state = useSession(id ?? "");
  const permission = useNotificationPermission();
  const { preferences } = usePreferences();
  const { weightUnit, weightIncrementKg, lighterWeeks, sounds, soundRest } = preferences.ui;
  const soundOn = restSoundOn({ sounds, soundRest });
  const session = id && state.status === "ready" ? state.session : null;
  const loading = id !== null && state.status === "loading";
  const granted = permission === "granted";
  useEffect(() => {
    if (loading) return;
    void refreshWorkoutLive(session ? { session, installId, granted } : null, {
      weightUnit,
      weightIncrementKg,
      lighterWeeks,
      soundOn,
    }).catch(() => undefined);
  }, [loading, session, installId, granted, weightUnit, weightIncrementKg, lighterWeeks, soundOn]);
  // Only on unmount: a changed option must not flash the notification away.
  useEffect(
    () => () => {
      void refreshWorkoutLive(null, {
        weightUnit: "kg",
        weightIncrementKg: null,
        lighterWeeks: [],
        soundOn: false,
      });
    },
    [],
  );
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
