import { Switch } from "heroui-native";
import { Vibrate, SpeakerHigh } from "phosphor-react-native";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { ListRow } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { usePreferences } from "@/preferences";

import { playSoundCue } from "./sound-cues";
import { CUE_VOLUME_STEPS } from "./sound-volume";

/**
 * The Rest alert rows of the Notifications screen: whether the end of a Rest vibrates, and how
 * loud the sound cues are. Picking a volume plays a tick at it.
 */
export function useRestAlertRows() {
  const { t } = useTranslation();
  const { preferences, setUi } = usePreferences();
  const { restVibration, cueVolume } = preferences.ui;
  const [pickerOpen, setPickerOpen] = useState(false);
  const rows = (
    <>
      <ListRow
        icon={Vibrate}
        title={t("reminder__rest_vibration")}
        description={t("reminder__rest_vibration_hint")}
        accessory="none"
        checked={restVibration}
        onPress={() => setUi({ restVibration: !restVibration })}
        trailing={
          <Switch
            accessibilityLabel={t("reminder__rest_vibration")}
            isSelected={restVibration}
            onSelectedChange={(value) => setUi({ restVibration: value })}
          />
        }
      />
      <ListRow
        icon={SpeakerHigh}
        title={t("reminder__cue_volume")}
        value={t("reminder__cue_volume_value", { volume: cueVolume })}
        onPress={() => setPickerOpen(true)}
      />
    </>
  );
  const picker = (
    <OptionSheet
      isOpen={pickerOpen}
      onOpenChange={setPickerOpen}
      title={t("reminder__cue_volume")}
      options={CUE_VOLUME_STEPS.map((step) => ({
        value: String(step),
        label: t("reminder__cue_volume_value", { volume: step }),
      }))}
      value={String(cueVolume)}
      onSelect={(value) => {
        const volume = Number(value);
        setUi({ cueVolume: volume });
        playSoundCue("tick", volume);
      }}
    />
  );
  return { rows, picker };
}
