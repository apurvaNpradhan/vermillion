import { useEffect } from "react";
import { Platform } from "react-native";
import { usePreferences } from "@/preferences";
import { useActiveSessions } from "@/session/lifecycle/use-active-sessions";
import { useInstallId } from "@/session/shared/use-install-id";
import { useSession } from "@/session/screen/use-session";
import { useNotificationPermission } from "@/platform/notifications/permission-store";
import { refreshWorkoutLive } from "./workout-live";
import { restSoundOn } from "@/session/settings/rest-sound";

function SessionLive({ id }: { id: string | null }) {
  const state = useSession(id ?? "");
  const permission = useNotificationPermission();
  const { preferences } = usePreferences();
  const { weightUnit, weightIncrementKg, lighterWeeks, sounds, soundRest } = preferences.ui;
  useEffect(() => {
    if (id && state.status === "loading") return;
    void refreshWorkoutLive(id, {
      weightUnit,
      weightIncrementKg,
      lighterWeeks,
      soundOn: restSoundOn({ sounds, soundRest }),
    }).catch(() => undefined);
  }, [id, state, permission, weightUnit, weightIncrementKg, lighterWeeks, sounds, soundRest]);
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
    <SessionLive id={sessions.find((session) => session.deviceId === installId)?.id ?? null} />
  );
}
