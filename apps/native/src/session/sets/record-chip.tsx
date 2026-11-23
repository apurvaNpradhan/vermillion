import { useState } from "react";
import { Text } from "react-native";
import Animated from "react-native-reanimated";

import { useTranslation } from "@/platform/i18n";
import { RECORD_ENTERING } from "@/session/shared/motion";

/** A newly earned PR pops once. On reopen or remount, its chip is already in place. */
export function RecordChip({
  record,
  animate,
  inHeader = false,
  hidden = false,
}: {
  record: string | null;
  animate: boolean;
  inHeader?: boolean;
  hidden?: boolean;
}) {
  const { t } = useTranslation();
  const [seen, setSeen] = useState(record);
  const [pop, setPop] = useState(false);
  // A collapsed header can fall back to an older PR when its latest set is unticked.
  if (record !== null && (seen === null || record > seen)) {
    setSeen(record);
    setPop(animate && !hidden);
  } else if (pop && (record === null || hidden || !animate)) {
    setPop(false);
  }
  if (record === null || hidden) return null;
  return (
    <Animated.View
      key={record}
      entering={pop ? RECORD_ENTERING : undefined}
      pointerEvents="none"
      accessible={!inHeader}
      accessibilityLabel={inHeader ? undefined : t("session__record_chip_label")}
      accessibilityLiveRegion={inHeader ? "none" : "polite"}
      className={`h-3.5 justify-center rounded-full bg-default px-1 ${inHeader ? "" : "absolute left-1 top-0"}`}
    >
      <Text className="font-semibold text-overline text-accent">{t("session__record_chip")}</Text>
    </Animated.View>
  );
}
