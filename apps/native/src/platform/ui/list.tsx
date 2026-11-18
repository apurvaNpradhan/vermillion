import { ListGroup, cn, useThemeColor } from "heroui-native";
import { CaretRight, Check, type IconProps } from "phosphor-react-native";
import { Children, createContext, useContext, type ComponentType, type ReactNode } from "react";
import { Text, View } from "react-native";

import { useSubtleColor } from "@/platform/theme";

const PlainContext = createContext(false);

/**
 * A titled group of rows on one card, as in iOS settings: an overline label on the canvas, then
 * `surface` with 16pt corners and padded rows. `variant="plain"` uses the page canvas and
 * extra space between rows. Settings screens keep the filled, rounded group.
 */
export function ListSection({
  title,
  children,
  variant = "grouped",
}: {
  title?: string;
  children: ReactNode;
  variant?: "grouped" | "plain";
}) {
  const plain = variant === "plain";
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View className="gap-2">
      {title ? (
        <Text
          accessibilityRole="header"
          className={
            plain
              ? "font-semibold text-title-md text-foreground"
              : "px-1 font-semibold text-overline uppercase text-muted"
          }
        >
          {title}
        </Text>
      ) : null}
      <PlainContext.Provider value={plain}>
        {plain ? (
          <View className="gap-2">{rows}</View>
        ) : (
          <ListGroup className="overflow-hidden rounded-2xl border-0 bg-surface py-1 shadow-none">
            {rows}
          </ListGroup>
        )}
      </PlainContext.Provider>
    </View>
  );
}

type RowAccessory = "chevron" | "check" | "none";

/**
 * One row: icon, title, an optional current value on the right, then a chevron (opens
 * something), a check (the chosen option) or nothing. `danger` rows are rose, for
 * destructive actions.
 */
export function ListRow({
  icon: Icon,
  title,
  value,
  description,
  accessory = "chevron",
  tone = "default",
  disabled,
  onPress,
  accessibilityHint,
  trailing,
  checked,
}: {
  icon?: ComponentType<IconProps>;
  title: string;
  value?: string;
  description?: string;
  accessory?: RowAccessory;
  tone?: "default" | "danger";
  disabled?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
  /** Replaces the accessory: a switch that toggles what the row names. */
  trailing?: ReactNode;
  /**
   * The switch state when `trailing` is a switch: the row then reads as one switch with its
   * state and description, and the inner switch is hidden from screen readers.
   */
  checked?: boolean;
}) {
  const isSwitch = checked !== undefined;
  const [muted, danger, foreground] = useThemeColor(["muted", "danger", "foreground"]);
  const subtle = useSubtleColor();
  const plain = useContext(PlainContext);
  const titleColor = tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <ListGroup.Item
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={isSwitch ? "switch" : "button"}
      accessibilityLabel={value ? `${title}, ${value}` : title}
      accessibilityHint={accessibilityHint ?? (isSwitch ? description : undefined)}
      accessibilityState={{
        selected: accessory === "check" ? true : undefined,
        checked: isSwitch ? checked : undefined,
        disabled,
      }}
      className={cn(
        "min-h-12 gap-3 py-3 active:bg-default",
        plain && "rounded-xl px-0 py-4",
        disabled && "opacity-50",
      )}
    >
      {Icon ? (
        <ListGroup.ItemPrefix>
          <Icon size={20} color={tone === "danger" ? danger : subtle} />
        </ListGroup.ItemPrefix>
      ) : null}
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle className={cn("text-body font-normal", titleColor)}>
          {title}
        </ListGroup.ItemTitle>
        {description ? <Text className="text-caption text-muted">{description}</Text> : null}
      </ListGroup.ItemContent>
      {value ? (
        <Text numberOfLines={1} className="max-w-[45%] text-body text-muted">
          {value}
        </Text>
      ) : null}
      {trailing ? (
        <ListGroup.ItemSuffix
          accessibilityElementsHidden={isSwitch}
          importantForAccessibility={isSwitch ? "no-hide-descendants" : "auto"}
        >
          {trailing}
        </ListGroup.ItemSuffix>
      ) : accessory === "none" ? null : (
        <ListGroup.ItemSuffix>
          {accessory === "check" ? (
            <Check size={20} color={foreground} />
          ) : (
            <CaretRight size={20} color={muted} />
          )}
        </ListGroup.ItemSuffix>
      )}
    </ListGroup.Item>
  );
}
