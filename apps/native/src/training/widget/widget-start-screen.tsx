import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { useActiveSessions, useStartSession } from "@/session";

/**
 * Opened by the widget's Start button (`<scheme>://widget-start?workout=<id>`). Resumes the active
 * Session when there is one, otherwise starts the Workout; it never shows the conflict sheet,
 * because the widget's tap is not an invitation to discard anything. Draws nothing: it hands over
 * to Home first so closing the Session lands there.
 */
export function WidgetStartScreen() {
  const router = useRouter();
  const { workout } = useLocalSearchParams<{ workout?: string }>();
  const active = useActiveSessions();
  const { start } = useStartSession();
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || active.loading) return;
    handled.current = true;
    router.replace("/");
    const resume = active.sessions[0];
    if (resume) router.push({ pathname: "/session/[id]", params: { id: resume.id } });
    else void start(workout ?? null);
  }, [active.loading, active.sessions, router, start, workout]);
  return null;
}
