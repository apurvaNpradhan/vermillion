import { Text } from "react-native";

/** A single line of text keeps punctuation and a smaller unit on the number's baseline. */
export function SummaryValue({ value, unit }: { value: string; unit?: string }) {
  return (
    <Text
      className="shrink font-semibold text-numeric-lg tabular-nums text-foreground"
      style={{ includeFontPadding: false }}
    >
      {value}
      {unit ? <Text className="font-normal text-caption text-muted">{`\u202F${unit}`}</Text> : null}
    </Text>
  );
}
