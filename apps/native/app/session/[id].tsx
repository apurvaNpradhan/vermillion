import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { SessionScreen } from "@/session";

const paramsSchema = z.object({ id: z.string(), backfill: z.literal("true").optional() });

/** The logging screen of one Session, presented over the tabs. */
export default function SessionRoute() {
  const router = useRouter();
  const { id, backfill } = paramsSchema.parse(useLocalSearchParams());
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return (
    <SessionScreen
      id={id}
      onMinimise={leave}
      onGone={leave}
      onOpenTimer={() =>
        router.push({
          pathname: "/session/[id]/timer",
          params: { id, ...(backfill ? { backfill } : {}) },
        })
      }
      onFinished={(finished) =>
        router.replace({
          pathname: "/session/[id]/summary",
          params: { id: finished, ...(backfill ? { backfill } : {}) },
        })
      }
    />
  );
}
