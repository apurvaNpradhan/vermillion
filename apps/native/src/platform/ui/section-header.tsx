import { Pressable, Text, View } from "react-native";

/**
 * The header row of a page section: a title on the left and, optionally, one accent text action
 * on the right ("Edit", "See all").
 */
export function SectionHeader({
  title,
  actionLabel,
  actionAccessibilityLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  /** Names the action for screen readers when the visible word is not enough ("See all programs"). */
  actionAccessibilityLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-3">
      <Text accessibilityRole="header" className="font-semibold text-title-md text-foreground">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
          hitSlop={8}
          onPress={onAction}
          className="min-h-11 justify-center active:opacity-60"
        >
          <Text className="font-medium text-body text-identity">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
