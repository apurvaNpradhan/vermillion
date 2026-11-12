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
import { Skeleton } from "@/platform/ui/skeleton";

import { useProgramActions } from "../use-program-actions";
import { usePrograms } from "../use-programs";

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
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          snapPoints={["50%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="h-full"
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
            {status === "loading" ? (
              <Skeleton label={t("common__loading")} className="h-12 w-full" />
            ) : null}
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
            {status === "empty" || status === "first-sync" ? (
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
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
