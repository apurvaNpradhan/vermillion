import { mountOnOpen } from "@/platform/ui/mount-on-open";
import { BottomSheet } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SHEET_SPRING, useSheetAnimation } from "@/platform/ui/sheet-motion";

/** The frame the Session's small sheets share: a title, an optional line under it, then content. */
function SheetShellBody({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const animation = useSheetAnimation();
  const { bottom } = useSafeAreaInsets();
  return (
    <BottomSheet animation={animation} isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="gap-4 px-4 pt-2"
          contentContainerProps={{ style: { paddingBottom: bottom + 16 } }}
        >
          <View className="gap-1 px-1">
            <BottomSheet.Title className="font-semibold text-title-lg">{title}</BottomSheet.Title>
            {description ? (
              <BottomSheet.Description className="text-body text-muted">
                {description}
              </BottomSheet.Description>
            ) : null}
          </View>
          {children}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

export const SheetShell = mountOnOpen(SheetShellBody);
