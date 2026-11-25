import { useLocalSearchParams } from "expo-router";

import { ManageEquipmentScreen } from "@/session/plates";

export default function PlatesRoute() {
  const { gymId } = useLocalSearchParams<{ gymId?: string }>();
  return <ManageEquipmentScreen gymId={gymId} />;
}
