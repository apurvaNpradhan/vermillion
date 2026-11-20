import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { useStartSession } from "@/session";

import { workoutIdFromParam } from "./widget-start";

/**
 * Opened by the widget's Start button (`<scheme>://widget-start?workout=<id>`). Hands over to
 * Home first so closing the Session lands there, then resumes the unfinished Session or starts the
 * Workout in one database operation and opens the Session it returns. A missing or malformed id
 * leaves the user on Home instead of starting a blank Session. It never shows the conflict sheet,
 * because the widget's tap is not an invitation to discard anything. Draws nothing.
 */
export function WidgetStartScreen() {
  const router = useRouter();
  const { workout } = useLocalSearchParams<{ workout?: string }>();
  const { startOrResume } = useStartSession();
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    router.replace("/");
    const workoutId = workoutIdFromParam(workout);
    if (workoutId) void startOrResume(workoutId);
  }, [router, startOrResume, workout]);
  return null;
}
