import { BodyMapPair, isBodyGroup } from "@/body-map";
import { MediaImage } from "@/media";
import { CardText, useImageSettle, type CardContext } from "@/share";
import { View } from "react-native";

import type { SessionCardData, SessionToggleId } from "./card-data";
import { CardHeading, CardStats, ExerciseRows, RecordsChip } from "./card-parts";
import { bodyIntensity } from "./muscles";

export type SessionCardProps = {
  data: SessionCardData;
  context: CardContext<SessionToggleId>;
};

/** Summary: the date, title and stats, then the exercise rows. */
export function SummaryCard({ data, context }: SessionCardProps) {
  const { palette } = context;
  return (
    <View style={{ flex: 1 }}>
      <CardHeading data={data} palette={palette} />
      <View style={{ marginTop: 56 }}>
        <CardStats data={data} palette={palette} />
      </View>
      {data.records ? (
        <View style={{ marginTop: 36 }}>
          <RecordsChip text={data.records} palette={palette} />
        </View>
      ) : null}
      {data.exercises ? (
        <View style={{ marginTop: 44 }}>
          <ExerciseRows exercises={data.exercises} palette={palette} />
        </View>
      ) : null}
    </View>
  );
}

/** Muscles: front and back heat, the top three muscles with their sets, and the stats. */
export function MusclesCard({ data, context }: SessionCardProps) {
  const { palette } = context;
  const intensity = bodyIntensity(data.loads, isBodyGroup);
  const max = Math.max(...data.muscles.map((muscle) => muscle.share), 0);
  return (
    <View style={{ flex: 1 }}>
      <CardHeading data={data} palette={palette} titleSize={92} />
      <View style={{ marginTop: 56 }}>
        <CardStats data={data} palette={palette} valueSize={60} />
      </View>
      <View style={{ flex: 1, marginTop: 40, flexDirection: "row", alignItems: "center", gap: 48 }}>
        <BodyMapPair intensity={intensity} gap={24} maxFigureWidth={290} style={{ width: 604 }} />
        <View style={{ flex: 1, gap: 44 }}>
          {data.muscles.map((muscle) => (
            <View key={muscle.name} style={{ gap: 10 }}>
              <CardText size={40} weight="semibold" color={palette.text} lines={1}>
                {muscle.name}
              </CardText>
              <CardText size={32} tabular color={palette.textSecondary} lines={1}>
                {muscle.sets}
              </CardText>
              <View
                style={{
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: palette.plate,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: palette.accent,
                    width: `${(max > 0 ? muscle.share / max : 0) * 100}%`,
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Photo: the Session photo fills the card (the composer draws it and the scrim); stats sit low. */
export function PhotoCard({ data, context }: SessionCardProps) {
  const { palette } = context;
  return (
    <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: 40 }}>
      <CardHeading data={data} palette={palette} titleSize={96} />
      <View style={{ marginTop: 56 }}>
        <CardStats data={data} palette={palette} />
      </View>
      {data.records ? (
        <View style={{ marginTop: 44 }}>
          <RecordsChip text={data.records} palette={palette} />
        </View>
      ) : null}
    </View>
  );
}

/** Sticker: the Summary stats block on a transparent canvas, on a solid plate that reads on any photo. */
export function StickerCard({ data, context }: SessionCardProps) {
  const { palette } = context;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 904,
          padding: 64,
          gap: 56,
          borderRadius: 64,
          backgroundColor: palette.ground,
        }}
      >
        <CardHeading data={data} palette={palette} titleSize={96} />
        <CardStats data={data} palette={palette} />
        {data.records ? <RecordsChip text={data.records} palette={palette} /> : null}
      </View>
    </View>
  );
}

/** The Session's first photo, full-bleed, for the Photo template and the Photo background. */
export function SessionPhotoLayer({ mediaId }: { mediaId: string }) {
  const settle = useImageSettle();
  return (
    <MediaImage
      mediaId={mediaId}
      variant="full"
      size={1080}
      height={1920}
      rounded="rounded-none"
      onSettled={settle}
    />
  );
}
