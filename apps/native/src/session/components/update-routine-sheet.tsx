import { BottomSheet, useThemeColor } from "heroui-native";
import { CaretDown, CaretUp } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { useIdentityColor, useOnIdentityColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

export type RoutineUpdate = { structure: boolean; targets: boolean; saveNew: boolean };

/**
 * After a save that differs from its source workout: update the workout with what was done, or
 * keep it as it was. When the source is gone, offer to save the session as a new workout. A plain
 * list says what would change; "Choose what to update" reveals one switch per kind of change.
 */
export function UpdateRoutineSheet({
  isOpen,
  title,
  missing,
  structureLines,
  targetLines,
  busy,
  onApply,
  onKeep,
}: {
  isOpen: boolean;
  /** The source workout's title. */
  title: string;
  /** The source workout no longer exists. */
  missing: boolean;
  structureLines: readonly string[];
  targetLines: readonly string[];
  busy: boolean;
  onApply: (update: RoutineUpdate) => void;
  /** Keep the workout as it was; also what dismissing the sheet means. */
  onKeep: () => void;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const [structure, setStructure] = useState(true);
  const [targets, setTargets] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const hasStructure = structureLines.length > 0;
  const hasTargets = targetLines.length > 0;
  const lines = [...structureLines, ...targetLines];
  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) onKeep();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="gap-4 px-4 pt-2"
          contentContainerProps={{ style: { paddingBottom: bottom + 16 } }}
        >
          <View className="gap-1 px-1">
            <BottomSheet.Title className="font-semibold text-title-lg">
              {t(missing ? "session__save_new_title" : "session__update_routine_title", { title })}
            </BottomSheet.Title>
            {missing ? (
              <BottomSheet.Description className="text-body text-muted">
                {t("session__save_new_body")}
              </BottomSheet.Description>
            ) : null}
          </View>
          {!missing && lines.length > 0 ? (
            <View className="gap-2 px-1">
              {lines.map((line, index) => (
                <Text key={index} className="text-body text-foreground">
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
          {!missing && hasStructure && hasTargets ? (
            <View className="gap-1">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: choosing }}
                className="min-h-11 flex-row items-center gap-2 px-1"
                onPress={() => setChoosing(!choosing)}
              >
                <Text className="text-body text-muted">{t("session__choose_update")}</Text>
                {choosing ? <CaretUp size={14} /> : <CaretDown size={14} />}
              </Pressable>
              {choosing ? (
                <View className="gap-1">
                  <Toggle
                    label={t("session__update_structure")}
                    value={structure}
                    onChange={setStructure}
                  />
                  <Toggle
                    label={t("session__update_targets")}
                    value={targets}
                    onChange={setTargets}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          <View className="gap-2">
            <Button
              isDisabled={busy}
              onPress={() =>
                onApply(
                  missing
                    ? { structure: false, targets: false, saveNew: true }
                    : {
                        structure: hasStructure && (structure || !hasTargets),
                        targets: hasTargets && (targets || !hasStructure),
                        saveNew: false,
                      },
                )
              }
            >
              <Button.Label>
                {t(missing ? "session__save_new_confirm" : "session__update_routine_confirm")}
              </Button.Label>
            </Button>
            <Button variant="secondary" isDisabled={busy} onPress={onKeep}>
              <Button.Label>
                {t(missing ? "session__not_now" : "session__keep_original")}
              </Button.Label>
            </Button>
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const identity = useIdentityColor();
  const field = useThemeColor("field");
  const thumb = useOnIdentityColor();
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-3 px-1">
      <Text className="flex-1 text-body text-foreground">{label}</Text>
      <Switch
        trackColor={{ false: field, true: identity }}
        thumbColor={thumb}
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
      />
    </View>
  );
}
