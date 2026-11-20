import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { ReportShareScreen, SessionShareScreen } from "@/session";

import { WorkoutShareScreen, ProgramShareScreen } from "@/training";
const paramsSchema = z.object({
  kind: z.enum(["session", "workout", "program", "report"]),
  id: z.string(),
});

/** The Share composer for one thing, by kind. */
export default function ShareRoute() {
  const router = useRouter();
  const params = paramsSchema.safeParse(useLocalSearchParams());
  if (!params.success) return <Redirect href="/" />;
  const Screen =
    params.data.kind === "workout"
      ? WorkoutShareScreen
      : params.data.kind === "program"
        ? ProgramShareScreen
        : params.data.kind === "report"
          ? ReportShareScreen
          : SessionShareScreen;
  return (
    <Screen
      id={params.data.id}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    />
  );
}
