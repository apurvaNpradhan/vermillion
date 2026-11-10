import { useLocalSearchParams } from "expo-router";
import { ManageEquipmentScreen } from "@/session/plates";
export default function PlatesRoute() {
  const { calculator } = useLocalSearchParams<{ calculator?: string }>();
  return (
    <ManageEquipmentScreen key={calculator ?? "closed"} openCalculator={calculator === "open"} />
  );
}
