import { View } from "react-native";

/** The fill of a day: `accent` follows the chosen accent, `success` is for done and positive. */
type HabitTone = "accent" | "success";

const FILLED = {
  accent: "bg-identity",
  success: "bg-success",
} as const satisfies Record<HabitTone, string>;

/**
 * A quiet grid of small rounded squares, oldest first, in rows of `columns` (10 by default, so 30
 * days make 10 x 3). A filled square is a day with the habit; the rest are `default`. No dates
 * and no numbers in the squares: the count goes beside it and in `label`, which the whole grid
 * reads out as one element.
 */
export function HabitGrid({
  cells,
  tone,
  label,
  columns = 10,
}: {
  cells: readonly boolean[];
  tone: HabitTone;
  label: string;
  columns?: number;
}) {
  const rows = Array.from({ length: Math.ceil(cells.length / columns) }, (_, row) =>
    cells.slice(row * columns, (row + 1) * columns),
  );
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} className="gap-1">
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-1">
          {Array.from({ length: columns }, (_, column) => {
            const filled = row[column];
            const fill = filled === true ? FILLED[tone] : "bg-default";
            // The last row is padded with hidden squares so every square keeps its size.
            return (
              <View
                key={column}
                className={`aspect-square flex-1 rounded-sm ${fill} ${filled === undefined ? "opacity-0" : ""}`}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
