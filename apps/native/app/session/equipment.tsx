import { useLocalSearchParams } from "expo-router";
import { z } from "zod";

import { ManageEquipmentScreen } from "@/session/plates";

/** Bars and plates, opened over the Session: for the Session's gym when it has one. */
export default function SessionEquipmentRoute() {
  const { gymId } = useLocalSearchParams();
  return <ManageEquipmentScreen gymId={z.uuid().safeParse(gymId).data} />;
}
