import { EQUIPMENT_KEYS, formatWeight, GYM_EQUIPMENT_CHOICES } from "@workspace/shared";
import { Switch } from "heroui-native";
import { Barbell } from "phosphor-react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { usePreference } from "@/preferences";

import { DumbbellMaxSheet } from "./dumbbell-max-sheet";
import { useGymAvailability } from "./use-gym-availability";

/**
 * "Equipment here": the equipment types a gym has, ticked on by default, and the heaviest dumbbell
 * it owns. Swaps and the exercise library favour what the gym has; nothing is ever blocked.
 */
export function EquipmentHereSection({ gymId }: { gymId?: string | null }) {
  const { t } = useTranslation();
  const unit = usePreference((preferences) => preferences.ui.weightUnit);
  const here = useGymAvailability(gymId);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <ListSection title={t("gym__here_title")}>
        <View className="px-4 pb-1 pt-2">
          <Text className="font-normal text-caption text-muted">{t("gym__here_hint")}</Text>
        </View>
        {GYM_EQUIPMENT_CHOICES.map((equipment) => {
          const has = here.has(equipment);
          return (
            <ListRow
              key={equipment}
              title={t(EQUIPMENT_KEYS[equipment])}
              accessory="none"
              checked={has}
              disabled={!here.ready}
              onPress={() => void here.setHas(equipment, !has)}
              trailing={
                <Switch
                  isDisabled={!here.ready}
                  isSelected={has}
                  onSelectedChange={(value) => void here.setHas(equipment, value)}
                />
              }
            />
          );
        })}
        <ListRow
          icon={Barbell}
          title={t("gym__dumbbell_max")}
          value={
            here.dumbbellMaxKg === null
              ? t("gym__dumbbell_max_none")
              : t("gym__dumbbell_max_value", {
                  weight: formatWeight(here.dumbbellMaxKg, unit),
                  unit,
                })
          }
          disabled={!here.ready}
          onPress={() => setEditing(true)}
        />
      </ListSection>
      <DumbbellMaxSheet
        isOpen={editing}
        onOpenChange={setEditing}
        valueKg={here.dumbbellMaxKg}
        unit={unit}
        onSave={here.setDumbbellMax}
      />
    </>
  );
}
