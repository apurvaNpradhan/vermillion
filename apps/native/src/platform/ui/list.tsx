import { ListGroup, Separator, cn, useThemeColor } from "heroui-native";
import { CaretRight, Check, type IconProps } from "phosphor-react-native";
import { Children, Fragment, type ComponentType, type ReactNode } from "react";
import { Text, View } from "react-native";

import { useSubtleColor } from "@/platform/theme";

/**
 * A titled group of rows on one card, as in iOS settings: an overline label on the canvas, then
 * `surface` with a hairline and 16pt corners, rows divided by inset hairlines.
 */
export function ListSection({ title, children }: { title?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View className="gap-2">
      {title ? (
        <Text
          accessibilityRole="header"
          className="px-1 font-semibold text-overline uppercase text-muted"
        >
          {title}
        </Text>
      ) : null}
      <ListGroup className="rounded-2xl border border-border shadow-none">
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 ? <Separator className="ml-12" /> : null}
            {row}
          </Fragment>
        ))}
      </ListGroup>
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
  accessory = "chevron",
  tone = "default",
  disabled,
  onPress,
  accessibilityHint,
}: {
  icon?: ComponentType<IconProps>;
  title: string;
  value?: string;
  accessory?: RowAccessory;
  tone?: "default" | "danger";
  disabled?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
}) {
  const [muted, danger, foreground] = useThemeColor(["muted", "danger", "foreground"]);
  const subtle = useSubtleColor();
  const titleColor = tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <ListGroup.Item
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: accessory === "check" ? true : undefined, disabled }}
      className={cn("min-h-12 gap-3 py-3", disabled && "opacity-50")}
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
      </ListGroup.ItemContent>
      {value ? (
        <Text numberOfLines={1} className="max-w-[45%] text-body text-muted">
          {value}
        </Text>
      ) : null}
      {accessory === "none" ? null : (
        <ListGroup.ItemSuffix>
          {accessory === "check" ? (
            <Check size={18} color={foreground} weight="bold" />
          ) : (
            <CaretRight size={16} color={muted} />
          )}
        </ListGroup.ItemSuffix>
      )}
    </ListGroup.Item>
  );
}
