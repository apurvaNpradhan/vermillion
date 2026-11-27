import { SheetPortal } from "@/platform/ui/modal-state";
import type {
  ExerciseType,
  RuleConfig,
  RuleId,
  RulePreviewSession,
  WeightUnit,
} from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { useMountOnOpen } from "@/platform/ui/mount-on-open";
import { progressionLabelKey, progressionParams } from "@/platform/ui/progression-reason";
import { ScrollableSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { useSheetAnimation } from "@/platform/ui/sheet-motion";
import { workText } from "@/platform/ui/work-text";

import { RULE_OPTIONS, previewGroups } from "./rule-text";

/** The four-Session preview of each rule for one exercise, by rule. */
export type RulePreviews = Readonly<Record<RuleId, readonly RulePreviewSession[]>>;

/**
 * Picks the progression rule of one exercise and shows what the chosen rule asks of its next four
 * sessions if every set is made. Picking a rule applies it at once; the sheet stays open so the
 * preview can be read.
 */
export function ProgressionRuleSheet({
  isOpen,
  onOpenChange,
  title,
  rule,
  onSelect,
  previews,
  type,
  unit,
  appliesNext = false,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The exercise's rule; null is Double. */
  rule: RuleConfig | null;
  onSelect: (rule: RuleConfig | null) => void;
  /** Null while what the preview needs has not loaded. */
  previews: RulePreviews | null;
  type: ExerciseType;
  unit: WeightUnit;
  /** The sets on screen keep their targets: the rule applies from the next session. */
  appliesNext?: boolean;
}) {
  const { t } = useTranslation();
  const animation = useSheetAnimation();
  const sheet = useMountOnOpen(isOpen);
  if (!sheet.mounted) return null;
  const chosen: RuleId = rule?.id ?? "double";
  const preview = previews?.[chosen] ?? [];
  return (
    <BottomSheet animation={animation} isOpen={sheet.open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <BottomSheet.Overlay />
        <ScrollableSheetContent>
          <View className="gap-1 px-4">
            <BottomSheet.Title className="font-semibold text-title-lg">
              {t("progress__rule")}
            </BottomSheet.Title>
            <BottomSheet.Description className="font-normal text-body text-muted">
              {title}
            </BottomSheet.Description>
          </View>
          <ListSection>
            {RULE_OPTIONS.map((option) => (
              <ListRow
                key={option.id}
                title={t(option.titleKey)}
                description={t(option.hintKey)}
                accessibilityHint={t(option.hintKey)}
                accessory={option.id === chosen ? "check" : "none"}
                onPress={() => {
                  if (option.id === chosen) return;
                  haptic.tick();
                  onSelect(option.id === "double" ? null : { id: option.id });
                }}
              />
            ))}
          </ListSection>
          <View className="gap-1 px-4">
            <Text accessibilityRole="header" className="font-semibold text-body text-foreground">
              {t("progress__rule_next_sessions")}
            </Text>
            {preview.length === 0 ? (
              <Text className="font-normal text-caption text-muted">
                {previews === null ? "" : t("progress__rule_empty")}
              </Text>
            ) : (
              <>
                <Text className="font-normal text-caption text-muted">
                  {t("progress__rule_next_hint")}
                </Text>
                {preview.map((session, index) => {
                  const groups = previewGroups(session, type, unit);
                  const sets = groups
                    .map((group) => {
                      // A hold or a carry says its time and distance where reps would be.
                      const reps = group.reps ?? workText(t, group) ?? group.reps;
                      if (group.weight === null)
                        return t("progress__rule_sets_reps", { count: group.count, reps });
                      return t(
                        type === "bodyweight_assisted_reps"
                          ? "progress__rule_sets_assisted"
                          : "progress__rule_sets_weighted",
                        { count: group.count, weight: group.weight, unit, reps },
                      );
                    })
                    .join(" · ");
                  const label = session.outcome
                    ? t(
                        progressionLabelKey(session.outcome),
                        progressionParams(
                          {
                            reason: session.reason,
                            sets: [],
                            outcomes: [],
                            incrementKg: 0,
                            breakDays: null,
                          },
                          session.outcome,
                          unit,
                        ),
                      )
                    : null;
                  return (
                    <View key={index} className="flex-row justify-between gap-3 py-1">
                      <Text className="font-normal text-body text-foreground tabular-nums">
                        {t("progress__rule_session", { number: index + 1, sets })}
                      </Text>
                      {label ? (
                        <Text className="shrink font-normal text-caption text-muted">{label}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </>
            )}
            {appliesNext ? (
              <Text className="pt-2 font-normal text-caption text-muted">
                {t("progress__rule_applies_next")}
              </Text>
            ) : null}
          </View>
        </ScrollableSheetContent>
      </SheetPortal>
    </BottomSheet>
  );
}
