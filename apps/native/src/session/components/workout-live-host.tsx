import { useEffect } from "react";
import { Platform } from "react-native";
import { usePreferences } from "@/preferences";
import { useActiveSessions } from "../use-active-sessions";
import { useInstallId } from "../use-install-id";
import { useSession } from "../use-session";
import { useRestPermission } from "../rest-permission-store";
import { refreshWorkoutLive } from "../workout-live";
import { restSoundOn } from "../rest-sound";

function SessionLive({ id }: { id: string | null }) {
  const state = useSession(id ?? "");
  const permission = useRestPermission();
  const { preferences } = usePreferences();
  const { weightUnit, weightIncrementKg, sounds, soundRest } = preferences.ui;
  useEffect(() => {
    if (id && state.status === "loading") return;
    void refreshWorkoutLive(id, {
      weightUnit,
      weightIncrementKg,
      soundOn: restSoundOn({ sounds, soundRest }),
    }).catch(() => undefined);
  }, [id, state, permission, weightUnit, weightIncrementKg, sounds, soundRest]);
  useEffect(
    () => () => {
      void refreshWorkoutLive(null, { weightUnit, weightIncrementKg, soundOn: false });
    },
    [weightUnit, weightIncrementKg],
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
