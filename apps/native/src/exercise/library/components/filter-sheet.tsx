import { FixedSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { EQUIPMENT, EQUIPMENT_KEYS, type MuscleGroup } from "@workspace/shared";
import { LIBRARY_SHOW, type LibraryShow } from "@workspace/sync";
import { BottomSheet, Switch } from "heroui-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

import { ChoiceCell, ChoiceGrid, EquipmentIcon } from "../../components/choice-grid";
import { MuscleRegions } from "../../components/muscle-rows";
import { toggled, withoutFacets, type LibraryFilterState } from "../filter-state";

/** All library filters in one sheet. */
export function FilterSheet({
  isOpen,
  onOpenChange,
  filters,
  onChange,
  total,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filters: LibraryFilterState;
  onChange: (filters: LibraryFilterState) => void;
  /** How many exercises match right now; the filters apply to the list as they change. */
  total: number | null;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const toggleMuscle = (muscle: MuscleGroup) =>
    onChange({ ...filters, muscles: toggled(filters.muscles, muscle), primaryDetail: null });

  const showOptions = LIBRARY_SHOW.map((value) => ({
    value,
    label: t(
      value === "all"
        ? "exercise__show_all"
        : value === "custom"
          ? "exercise__show_custom"
          : "exercise__show_archived",
    ),
  }));

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <FixedSheetContent
          fraction={0.88}
          enableDynamicSizing={false}
          enableOverDrag={false}
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
        >
          <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
            <BottomSheet.Title className="font-semibold text-title-lg">
              {t("exercise__filters_title")}
            </BottomSheet.Title>
            <Pressable
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => onChange(withoutFacets(filters))}
            >
              <Text className="font-normal text-body text-subtle">{t("exercise__clear")}</Text>
            </Pressable>
          </View>
          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingBottom: 16 }}
          >
            <View>
              <SectionTitle>{t("exercise__section_muscle")}</SectionTitle>
              <MuscleRegions
                isSelected={(muscle) => filters.muscles.includes(muscle)}
                onPress={toggleMuscle}
              />
              <View className="mt-4 flex-row items-center justify-between gap-4">
                <Text className="font-normal flex-1 text-body text-foreground">
                  {t("exercise__include_secondary")}
                </Text>
                <Switch
                  isSelected={filters.includeSecondary}
                  onSelectedChange={(includeSecondary) => {
                    haptic.tick();
                    onChange({ ...filters, includeSecondary });
                  }}
                  accessibilityLabel={t("exercise__include_secondary")}
                />
              </View>
            </View>
            <View>
              <SectionTitle>{t("exercise__section_equipment")}</SectionTitle>
              <ChoiceGrid
                items={EQUIPMENT}
                render={(kind) => (
                  <ChoiceCell
                    key={kind}
                    label={t(EQUIPMENT_KEYS[kind])}
                    selected={filters.equipment.includes(kind)}
                    onPress={() =>
                      onChange({ ...filters, equipment: toggled(filters.equipment, kind) })
                    }
                    icon={<EquipmentIcon kind={kind} />}
                  />
                )}
              />
            </View>
            <View>
              <SectionTitle>{t("exercise__section_show")}</SectionTitle>
              <SegmentedControl<LibraryShow>
                options={showOptions}
                value={filters.show}
                onChange={(show) => onChange({ ...filters, show })}
                accessibilityLabel={t("exercise__section_show")}
              />
            </View>
          </BottomSheetScrollView>
          <View className="px-5 pt-3" style={{ paddingBottom: bottom + 16 }}>
            <Button variant="primary" onPress={() => onOpenChange(false)}>
              <Button.Label>{t("exercise__show_results", { count: total ?? 0 })}</Button.Label>
            </Button>
          </View>
        </FixedSheetContent>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text
      accessibilityRole="header"
      className="pb-3 font-semibold text-overline uppercase text-muted"
    >
      {children}
    </Text>
  );
}
