import { SheetPortal } from "@/platform/ui/modal-state";
import { FixedSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { BottomSheet } from "heroui-native";
import { useRouter } from "expo-router";
import { Plus } from "phosphor-react-native";
import { EmptyState } from "@/platform/ui/empty-state";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

import { useProgramActions } from "@/training/programs/use-program-actions";
import { usePrograms } from "@/training/programs/use-programs";
import { isFirstSync } from "@/training/train/train-status";

/**
 * "Add to program…" from a standalone Workout: your Programs, each a tap away. The Workout is
 * copied and appended to the Rotation as a new Slot; the original stays standalone.
 */
export function AddToProgramSheet({
  workoutId,
  isOpen,
  onOpenChange,
}: {
  workoutId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const { status, programs } = usePrograms();
  const actions = useProgramActions();

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <SheetPortal>
        <BottomSheet.Overlay />
        <FixedSheetContent
          fraction={0.5}
          enableDynamicSizing={false}
          enableOverDrag={false}
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
        >
          <View className="px-5 pb-3 pt-2">
            <BottomSheet.Title className="font-semibold text-title-lg">
              {t("training__add_to_program_title")}
            </BottomSheet.Title>
          </View>
          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 16, paddingHorizontal: 20, paddingBottom: bottom + 16 }}
          >
            {status === "list" ? (
              <ListSection>
                {programs.map((program) => (
                  <ListRow
                    key={program.id}
                    title={program.title}
                    accessory="none"
                    onPress={() => {
                      onOpenChange(false);
                      void actions.addToProgram(workoutId, program.id, program.title);
                    }}
                  />
                ))}
              </ListSection>
            ) : null}
            {status === "empty" || isFirstSync(status) ? (
              <EmptyState
                icon={Plus}
                title={t("training__no_programs")}
                action={{
                  label: t("training__new_program"),
                  onPress: () => {
                    onOpenChange(false);
                    router.push("/train/new-program");
                  },
                }}
              />
            ) : null}
          </BottomSheetScrollView>
        </FixedSheetContent>
      </SheetPortal>
    </BottomSheet>
  );
}
