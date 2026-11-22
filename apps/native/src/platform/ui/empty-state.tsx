/**
 * Source: PanelUI (panelui-native 1.2.0), `EmptyState`. MIT licence, https://github.com/panel-ui/PanelUI.
 * Changed: compound parts and ghost-card media dropped for the Sigil anatomy (Phosphor icon 48pt
 * in text-muted, or the hairline construction drawing, a mono label with the real count, one line,
 * one optional action through our Button).
 */
import type { IconProps } from "phosphor-react-native";
import type { ComponentType } from "react";
import { Text, View } from "react-native";

import { useThemeColor } from "heroui-native";

import { Button } from "@/platform/ui/button";
import { ConstructionDrawing } from "@/platform/ui/construction-drawing";

export type EmptyStateProps = {
  icon: ComponentType<IconProps>;
  /** Draw the construction drawing instead of the icon: for "nothing here yet", never errors. */
  drawing?: boolean;
  /** A mono label with the real count (`0 workouts`); shown in capitals under the drawing. */
  label?: string;
  /** One sentence. */
  title: string;
  action?: { label: string; onPress: () => void };
};

/** Nothing here yet: drawing or icon, an optional count, one line, at most one action. */
export function EmptyState({ icon: Icon, drawing = false, label, title, action }: EmptyStateProps) {
  const muted = useThemeColor("muted");
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6 py-12">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {drawing ? <ConstructionDrawing /> : <Icon size={48} color={muted} />}
      </View>
      <View className="items-center gap-1">
        {label ? (
          <Text className="font-mono text-overline uppercase tracking-widest text-muted">
            {label}
          </Text>
        ) : null}
        <Text accessibilityRole="text" className="font-normal text-center text-body text-muted">
          {title}
        </Text>
      </View>
      {action ? (
        <Button variant="primary" onPress={action.onPress}>
          <Button.Label>{action.label}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}
