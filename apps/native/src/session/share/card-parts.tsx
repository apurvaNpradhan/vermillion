import { ExerciseThumbnail } from "@/exercise";
import { CardText, useImageSettle } from "@/share";
import type { CardPalette } from "@workspace/ui/tokens/share-card";
import { Medal } from "phosphor-react-native";
import { View } from "react-native";

import type { SessionCardData } from "./card-data";
import { rowMetrics } from "./rows";

/** The date line and the big title that open every Session card. */
export function CardHeading({
  data,
  palette,
  titleSize = 96,
}: {
  data: Pick<SessionCardData, "date" | "title">;
  palette: CardPalette;
  titleSize?: number;
}) {
  return (
    <View style={{ gap: 24 }}>
      <CardText size={38} color={palette.textSecondary} tracking={0.4}>
        {data.date}
      </CardText>
      <CardText
        size={titleSize}
        lineHeight={Math.round(titleSize * 1.08)}
        weight="bold"
        tracking={-titleSize * 0.02}
        color={palette.text}
        lines={2}
      >
        {data.title}
      </CardText>
    </View>
  );
}

/** Duration · Volume · Sets: a muted caption over a large tabular value, no boxes. */
export function CardStats({
  data,
  palette,
  valueSize = 68,
}: {
  data: Pick<SessionCardData, "stats">;
  palette: CardPalette;
  valueSize?: number;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 64 }}>
      {data.stats.map((stat) => (
        <View key={stat.id} style={{ gap: 10, flexShrink: 1 }}>
          <CardText size={27} weight="medium" tracking={3} upper color={palette.textMuted}>
            {stat.label}
          </CardText>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
            <CardText size={valueSize} weight="semibold" tabular color={palette.text} lines={1}>
              {stat.value}
            </CardText>
            {stat.unit ? (
              <CardText size={valueSize * 0.5} weight="medium" color={palette.textSecondary}>
                {stat.unit}
              </CardText>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** "3 Records" with the medal, only when the Session set any. */
export function RecordsChip({ text, palette }: { text: string; palette: CardPalette }) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        height: 80,
        paddingHorizontal: 32,
        borderRadius: 40,
        backgroundColor: palette.plate,
      }}
    >
      <Medal size={42} color={palette.accent} weight="fill" />
      <CardText size={36} weight="semibold" color={palette.text}>
        {text}
      </CardText>
    </View>
  );
}

/** The exercise rows: round thumbnail, name, "4 sets · best 100 kg × 5" and a Record mark. */
export function ExerciseRows({
  exercises,
  palette,
}: {
  exercises: NonNullable<SessionCardData["exercises"]>;
  palette: CardPalette;
}) {
  const metrics = rowMetrics(exercises.items.length);
  return (
    <View style={{ borderTopWidth: 2, borderTopColor: palette.hairline }}>
      {exercises.items.map((item) => (
        <View
          key={item.id}
          style={{ height: metrics.height, flexDirection: "row", alignItems: "center", gap: 28 }}
        >
          <CardThumb
            title={item.title}
            thumbnailKey={item.thumbnailKey}
            imageMediaId={item.imageMediaId}
            size={metrics.thumb}
            palette={palette}
          />
          <View style={{ flex: 1 }}>
            <CardText size={metrics.name} weight="semibold" color={palette.text} lines={1}>
              {item.title}
            </CardText>
            <CardText size={metrics.detail} color={palette.textSecondary} tabular lines={1}>
              {item.summary}
            </CardText>
          </View>
          {item.record ? (
            <Medal size={metrics.thumb * 0.5} color={palette.accent} weight="fill" />
          ) : null}
        </View>
      ))}
      {exercises.more ? (
        <View style={{ height: 64, justifyContent: "center" }}>
          <CardText size={32} weight="medium" color={palette.textMuted}>
            {exercises.more}
          </CardText>
        </View>
      ) : null}
    </View>
  );
}

/** A round exercise picture from local files; a letter on the card's plate when there is none. */
function CardThumb({
  title,
  thumbnailKey,
  imageMediaId,
  size,
  palette,
}: {
  title: string;
  thumbnailKey: string | null;
  imageMediaId: string | null;
  size: number;
  palette: CardPalette;
}) {
  const settle = useImageSettle();
  return (
    <ExerciseThumbnail
      localOnly
      title={title}
      thumbnailKey={thumbnailKey}
      imageMediaId={imageMediaId}
      size={size}
      plate={{ background: palette.plate, ink: palette.textSecondary }}
      onSettled={settle}
    />
  );
}
