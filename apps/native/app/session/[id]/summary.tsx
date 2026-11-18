import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { SessionSummaryScreen } from "@/session";

const paramsSchema = z.object({ id: z.string(), backfill: z.literal("true").optional() });

/** Shown after Finish; closing it returns to the tabs. */
export default function SessionSummaryRoute() {
  const router = useRouter();
  const { id, backfill } = paramsSchema.parse(useLocalSearchParams());
  return (
    <SessionSummaryScreen
      id={id}
      backfill={backfill === "true"}
      // The summary is the only screen left in the Session stack, so dismissing closes the modal.
      onDone={() => (router.canDismiss() ? router.dismiss() : router.replace("/"))}
    />
  );
}
