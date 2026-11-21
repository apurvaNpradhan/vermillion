/**
 * Source: PanelUI (panelui-native 1.2.0), `EmptyState`. MIT licence, https://github.com/panel-ui/PanelUI.
 * Changed: compound parts and ghost-card media dropped for the DESIGN.md anatomy (Phosphor icon
 * 48pt in text-muted, or the Mascot, one line, one optional action through our Button).
 */
import type { IconProps } from "phosphor-react-native";
import type { ComponentType } from "react";
import { Text, View } from "react-native";

import { useThemeColor } from "heroui-native";

import { Button } from "@/platform/ui/button";
import { Mascot } from "@/platform/ui/mascot";

export type EmptyStateProps = {
  icon: ComponentType<IconProps>;
  /** Draw the low-emphasis tortoise instead of the icon: for "nothing here yet", never errors. */
  mascot?: boolean;
  /** One sentence. */
  title: string;
  action?: { label: string; onPress: () => void };
};

/** Nothing here yet: icon, one line, at most one action. Fills its parent and centres. */
export function EmptyState({ icon: Icon, mascot = false, title, action }: EmptyStateProps) {
  const muted = useThemeColor("muted");
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6 py-12">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {mascot ? <Mascot size={88} /> : <Icon size={48} color={muted} />}
      </View>
      <Text accessibilityRole="text" className="font-normal text-center text-body text-muted">
        {title}
      </Text>
      {action ? (
        <Button variant="primary" onPress={action.onPress}>
          <Button.Label>{action.label}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}
