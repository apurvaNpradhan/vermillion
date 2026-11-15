import Svg, { Path } from "react-native-svg";
import { useChartColor } from "@/platform/theme";
export function Sparkline({ values }: { values: readonly number[] }) {
  const ink = useChartColor();
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <Svg width={88} height={32} accessible={false}>
      <Path
        d={values
          .map(
            (value, i) =>
              `${i ? "L" : "M"}${4 + (i / Math.max(1, values.length - 1)) * 80},${28 - ((value - min) / Math.max(0.1, max - min)) * 24}`,
          )
          .join(" ")}
        fill="none"
        stroke={ink}
        strokeWidth={1.5}
      />
    </Svg>
  );
}
