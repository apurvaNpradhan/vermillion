import { useRouter } from "expo-router";
import { Scales } from "phosphor-react-native";
import { formatWeight } from "@workspace/shared";
import { useTranslation } from "@/platform/i18n";
import { ListRow } from "@/platform/ui/list";
import { useWeight } from "./use-weight";
export function WeightPreferenceRow() {
  const weight = useWeight();
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <ListRow
      icon={Scales}
      title={t("body__title")}
      description={weight.entries.length ? t("body__from_log") : t("body__empty")}
      value={
        weight.trend === null
          ? undefined
          : t("body__value", { value: formatWeight(weight.trend, weight.unit), unit: weight.unit })
      }
      onPress={() => router.push("/body/weight")}
    />
  );
}
