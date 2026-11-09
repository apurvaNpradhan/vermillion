import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { EQUIPMENT, EQUIPMENT_KEYS, type MuscleGroup } from "@workspace/shared";
import { LIBRARY_SHOW, type LibraryFilters, type LibraryShow } from "@workspace/sync";
import { BottomSheet, Switch } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BodyMapPair, UNDRAWN } from "@/body-map";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

import { ChoiceCell, ChoiceGrid, EquipmentIcon } from "../../components/choice-grid";
import { MuscleRegions, MuscleRows } from "../../components/muscle-rows";
import { toggled, withoutFacets } from "../filter-state";

export type FilterSection = "muscle" | "equipment";

type MuscleView = "body" | "list";

/** Opens scrolled to `section` when it is set, so a pill lands on its own section. */
export function FilterSheet({
  isOpen,
  onOpenChange,
  section,
  filters,
  onChange,
  total,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  section: FilterSection | null;
  filters: LibraryFilters;
  onChange: (filters: LibraryFilters) => void;
  /** How many exercises match right now; the filters apply to the list as they change. */
  total: number | null;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const scroll = useRef<{ scrollTo: (options: { y: number; animated: boolean }) => void } | null>(
    null,
  );
  const [muscleView, setMuscleView] = useState<MuscleView>("list");
  const offsets = useRef<Record<FilterSection, number>>({ muscle: 0, equipment: 0 });

  useEffect(() => {
    if (!isOpen || section === null) return;
    // After the sheet has come up and the sections have been measured.
    const timer = setTimeout(
      () => scroll.current?.scrollTo({ y: offsets.current[section], animated: true }),
      450,
    );
    return () => clearTimeout(timer);
  }, [isOpen, section]);

  const toggleMuscle = (muscle: MuscleGroup) =>
    onChange({ ...filters, muscles: toggled(filters.muscles, muscle) });

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
        <BottomSheet.Content
          snapPoints={["88%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="h-full"
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
              <Text className="text-body text-subtle">{t("exercise__clear")}</Text>
            </Pressable>
          </View>
          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            ref={(node) => {
              scroll.current = node;
            }}
            contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingBottom: 16 }}
          >
            <View
              onLayout={(event) => {
                offsets.current.muscle = event.nativeEvent.layout.y;
              }}
            >
              <SectionTitle>{t("exercise__section_muscle")}</SectionTitle>
              <View className="mb-4">
                <SegmentedControl<MuscleView>
                  options={[
                    { value: "body", label: t("exercise__view_body") },
                    { value: "list", label: t("exercise__view_list") },
                  ]}
                  value={muscleView}
                  onChange={setMuscleView}
                  accessibilityLabel={t("exercise__view_group")}
                />
              </View>
              {muscleView === "body" ? (
                <View className="gap-4">
                  <BodyMapPair
                    selected={filters.muscles}
                    onPressGroup={(muscle) => {
                      haptic.tick();
                      toggleMuscle(muscle);
                    }}
                  />
                  <Text className="text-center text-caption text-muted">
                    {t("exercise__body_hint")}
                  </Text>
                  <MuscleRows
                    muscles={UNDRAWN}
                    isSelected={(muscle) => filters.muscles.includes(muscle)}
                    onPress={toggleMuscle}
                  />
                </View>
              ) : (
                <MuscleRegions
                  isSelected={(muscle) => filters.muscles.includes(muscle)}
                  onPress={toggleMuscle}
                />
              )}
              <View className="mt-4 flex-row items-center justify-between gap-4">
                <Text className="flex-1 text-body text-foreground">
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
            <View
              onLayout={(event) => {
                offsets.current.equipment = event.nativeEvent.layout.y;
              }}
            >
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
        </BottomSheet.Content>
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
