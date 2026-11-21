import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { haptic } from "@/platform/haptics";

import { useWidgetStart } from "./use-widget-start";
import { workoutIdFromParam } from "./widget-start";

/** Handles the widget's Start link once local storage has opened. */
export function WidgetStartScreen() {
  const router = useRouter();
  const { workout } = useLocalSearchParams<{ workout?: string }>();
  const { isOpening, startOrResume } = useWidgetStart();
  const handled = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (handled.current) return;
    const workoutId = workoutIdFromParam(workout);
    if (!workoutId) {
      handled.current = true;
      router.replace("/train");
      return;
    }
    if (isOpening) return;
    handled.current = true;
    void startOrResume(workoutId).then((result) => {
      if (!mounted.current) return;
      if (!result) {
        router.replace("/train");
        return;
      }
      if (result.outcome === "started") haptic.confirm();
      // Closing the Session returns to Home.
      router.replace("/");
      router.push({ pathname: "/session/[id]", params: { id: result.id } });
    });
  }, [isOpening, router, startOrResume, workout]);
  return null;
}
