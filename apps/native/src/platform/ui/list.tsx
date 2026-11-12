import { ListGroup, Separator, cn, useThemeColor } from "heroui-native";
import { CaretRight, Check, type IconProps } from "phosphor-react-native";
import {
  Children,
  Fragment,
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";
import { Text, View } from "react-native";

import { useSubtleColor } from "@/platform/theme";

const PlainContext = createContext(false);

/**
 * A titled group of rows on one card, as in iOS settings: an overline label on the canvas, then
 * `surface` with a hairline and 16pt corners, rows divided by inset hairlines. `variant="plain"`
 * is for content pages: no fill and no corners, rows on the canvas divided by full-width
 * hairlines, with the page's own gutter. Settings screens keep the grouped look.
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
          <View>
            {rows.map((row, index) => (
              <Fragment key={index}>
                {index > 0 ? <Separator /> : null}
                {row}
              </Fragment>
            ))}
          </View>
        ) : (
          <ListGroup className="rounded-2xl border border-transparent shadow-none">
            {rows.map((row, index) => (
              <Fragment key={index}>
                {index > 0 ? <Separator className="ml-12" /> : null}
                {row}
              </Fragment>
            ))}
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
}) {
  const [muted, danger, foreground] = useThemeColor(["muted", "danger", "foreground"]);
  const subtle = useSubtleColor();
  const plain = useContext(PlainContext);
  const titleColor = tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <ListGroup.Item
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: accessory === "check" ? true : undefined, disabled }}
      className={cn("min-h-12 gap-3 py-3", plain && "px-0", disabled && "opacity-50")}
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
