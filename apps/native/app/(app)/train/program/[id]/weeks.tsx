import { useLocalSearchParams } from "expo-router";
import { z } from "zod";

import { PlanWeeksScreen } from "@/training";

const paramsSchema = z.object({ id: z.string() });

export default function ProgramWeeksRoute() {
  const { id } = paramsSchema.parse(useLocalSearchParams());
  return <PlanWeeksScreen id={id} />;
}
