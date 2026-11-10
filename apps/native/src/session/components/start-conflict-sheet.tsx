import type { ActiveSession } from "@workspace/sync";
import { View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

import { SheetShell } from "./sheet-shell";

/** Shown when starting while a Session is active: resume it, or discard it and start the new one. */
export function StartConflictSheet({
  active,
  isOpen,
  onOpenChange,
  onResume,
  onDiscardAndStart,
}: {
  active: readonly ActiveSession[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onResume: (id: string) => void;
  onDiscardAndStart: () => void;
}) {
  const { t } = useTranslation();
  const first = active[0];
  return (
    <SheetShell
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t("session__conflict_title")}
      description={
        active.length > 1
          ? t("session__conflict_many", { count: active.length })
          : t("session__conflict_one", { title: first?.title ?? "" })
      }
    >
      <View className="gap-2">
        {first ? (
          <Button variant="primary" onPress={() => onResume(first.id)}>
            <Button.Label numberOfLines={1}>
              {t("session__resume_named", { title: first.title })}
            </Button.Label>
          </Button>
        ) : null}
        <Button variant="danger-soft" onPress={onDiscardAndStart}>
          <Button.Label>{t("session__discard_and_start")}</Button.Label>
        </Button>
      </View>
    </SheetShell>
  );
}
