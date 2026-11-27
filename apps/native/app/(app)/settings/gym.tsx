import { useLocalSearchParams } from "expo-router";

import { GymScreen } from "@/gym";

export default function GymRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GymScreen id={id} />;
}
