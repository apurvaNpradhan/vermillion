import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { ReportShareScreen, SessionShareScreen } from "@/session";

import { WorkoutShareScreen, ProgramShareScreen } from "@/training";
const paramsSchema = z.object({
  kind: z.enum(["session", "workout", "program", "report"]),
  id: z.string(),
  snapshot: z.string().optional().catch(undefined),
});

/** The Share composer for one thing, by kind. */
export default function ShareRoute() {
  const router = useRouter();
  const params = paramsSchema.safeParse(useLocalSearchParams());
  if (!params.success) return <Redirect href="/" />;
  const { id, kind, snapshot } = params.data;
  const onClose = () => (router.canGoBack() ? router.back() : router.replace("/"));
  if (kind === "report") return <ReportShareScreen id={id} snapshot={snapshot} onClose={onClose} />;
  const Screen =
    kind === "workout"
      ? WorkoutShareScreen
      : kind === "program"
        ? ProgramShareScreen
        : SessionShareScreen;
  return <Screen id={id} onClose={onClose} />;
}
