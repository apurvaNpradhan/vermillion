import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { TimerScreen } from "@/session";

const paramsSchema = z.object({ id: z.string() });

/** The full-screen Timer of one Session; closing it returns to the sets view. */
export default function SessionTimerRoute() {
  const router = useRouter();
  const { id } = paramsSchema.parse(useLocalSearchParams());
  return (
    <TimerScreen
      id={id}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onGone={() => (router.canDismiss() ? router.dismiss() : router.replace("/"))}
      // The Timer sits on top of the sets view: close it, then replace the sets view with the
      // summary, as Finish does there (the summary's Done then closes the whole modal).
      onFinished={(finished) => {
        router.back();
        router.replace({ pathname: "/session/[id]/summary", params: { id: finished } });
      }}
    />
  );
}
