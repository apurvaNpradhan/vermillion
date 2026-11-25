import { formatWeight, type Equipment, type WeightUnit } from "@workspace/shared";
import { Barbell, Notepad, Ruler } from "phosphor-react-native";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";

import { LoadLimitsSheet } from "./load-limits-sheet";
import { useGymSetting } from "./use-gym-setting";

/**
 * The exercise's settings that belong to a gym: max load, load step and setup note. They read as
 * plain exercise settings; which gym they are for only shows once there is more than one.
 */
export function GymLimitRows({
  exerciseId,
  title,
  equipment,
  gymId,
  unit,
}: {
  exerciseId: string;
  title: string;
  equipment: Equipment;
  gymId?: string | null;
  unit: WeightUnit;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const setting = useGymSetting(exerciseId, gymId);
  if (!setting.ready) return null;
  const amount = (kg: number | null) =>
    kg === null ? t("gym__not_set") : t("plates__weight", { weight: formatWeight(kg, unit), unit });
  return (
    <>
      <ListSection
        title={
          setting.gymName
            ? t("gym__load_settings_at", { gym: setting.gymName })
            : t("gym__load_settings")
        }
      >
        <ListRow
          icon={Barbell}
          title={t("gym__max_load")}
          value={amount(setting.maxKg)}
          onPress={() => setOpen(true)}
        />
        <ListRow
          icon={Ruler}
          title={t("gym__load_step")}
          value={amount(setting.stepKg)}
          onPress={() => setOpen(true)}
        />
        <ListRow
          icon={Notepad}
          title={t("gym__setup_note")}
          value={setting.note ?? t("gym__not_set")}
          description={setting.note === null ? t("gym__setup_note_hint") : undefined}
          onPress={() => setOpen(true)}
        />
      </ListSection>
      <LoadLimitsSheet
        isOpen={open}
        onOpenChange={setOpen}
        exerciseId={exerciseId}
        title={title}
        equipment={equipment}
        gymId={gymId}
        unit={unit}
      />
    </>
  );
}
