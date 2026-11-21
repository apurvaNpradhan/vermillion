import { formatPercent, groupRows } from "@/training";
import { MUSCLE_GROUP_KEYS, type MuscleShares } from "@workspace/shared";
import type { CardPalette } from "@workspace/ui/tokens/share-card";
import { View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { CardText, type CardContext } from "@/share";

import { RecordsChip } from "../share/card-parts";
import { reportShareStats, type ReportView, type StatView } from "./report-view";

export type ReportToggleId = "weights";

/** What a report card says: the title block and the formatted view. */
export type ReportCardData = {
  kicker: string;
  title: string;
  view: ReportView;
  shares: MuscleShares;
};

type Props = { data: ReportCardData; context: CardContext<ReportToggleId> };

/** "+12%" or "−8%"; a plain figure when nothing changed. */
function changeText(change: NonNullable<StatView["change"]>): string {
  return change.direction === "up"
    ? `+${change.text}`
    : change.direction === "down"
      ? `−${change.text}`
      : change.text;
}

function Heading({ data, palette }: { data: ReportCardData; palette: CardPalette }) {
  return (
    <View style={{ gap: 24 }}>
      <CardText size={38} color={palette.textSecondary} tracking={0.4}>
        {data.kicker}
      </CardText>
      <CardText
        size={96}
        lineHeight={104}
        weight="bold"
        tracking={-1.9}
        color={palette.text}
        lines={2}
      >
        {data.title}
      </CardText>
    </View>
  );
}

/** The figures in two columns, each with its change and a muted caption over a large value. */
function Stats({
  stats,
  versus,
  palette,
}: {
  stats: readonly StatView[];
  versus: string | null;
  palette: CardPalette;
}) {
  return (
    <View style={{ gap: 28 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 44 }}>
        {stats.map((stat) => (
          <View key={stat.id} style={{ width: "50%", gap: 10, paddingRight: 24 }}>
            <CardText size={27} weight="medium" tracking={3} upper color={palette.textMuted}>
              {stat.label}
            </CardText>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
              <CardText size={72} weight="semibold" tabular color={palette.text} lines={1}>
                {stat.value}
              </CardText>
              {stat.unit ? (
                <CardText size={36} weight="medium" color={palette.textSecondary}>
                  {stat.unit}
                </CardText>
              ) : null}
            </View>
            {stat.change ? (
              <CardText size={30} tabular color={palette.textSecondary}>
                {changeText(stat.change)}
              </CardText>
            ) : null}
          </View>
        ))}
      </View>
      {versus ? (
        <CardText size={30} color={palette.textMuted}>
          {versus}
        </CardText>
      ) : null}
    </View>
  );
}

/** Summary: the title, the figures with their change, the Records and the top exercises. */
export function ReportSummaryCard({ data, context }: Props) {
  const { t } = useTranslation();
  const { palette, toggles } = context;
  const { view } = data;
  const stats = reportShareStats(view, toggles.weights);
  const top = view.topBySets.slice(0, 3);
  return (
    <View style={{ flex: 1 }}>
      <Heading data={data} palette={palette} />
      <View style={{ marginTop: 56 }}>
        <Stats stats={stats} versus={view.versus} palette={palette} />
      </View>
      {view.records ? (
        <View style={{ marginTop: 44 }}>
          <RecordsChip text={view.records} palette={palette} />
        </View>
      ) : null}
      {top.length > 0 ? (
        <View style={{ marginTop: 48, gap: 6 }}>
          <CardText size={27} weight="medium" tracking={3} upper color={palette.textMuted}>
            {t("report__top_sets")}
          </CardText>
          <View style={{ borderTopWidth: 2, borderTopColor: palette.hairline, marginTop: 14 }}>
            {top.map((row) => (
              <View
                key={row.id}
                style={{
                  height: 92,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 24,
                }}
              >
                <View style={{ flex: 1 }}>
                  <CardText size={40} weight="semibold" color={palette.text} lines={1}>
                    {row.title}
                  </CardText>
                </View>
                <CardText size={34} tabular color={palette.textSecondary}>
                  {row.value}
                </CardText>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Muscles: the share of sets per muscle group as bars with their percentage. */
export function ReportMusclesCard({ data, context }: Props) {
  const { t, i18n } = useTranslation();
  const { palette } = context;
  const rows = groupRows(data.shares, 6);
  const top = Math.max(...rows.map((row) => row.share), 0);
  return (
    <View style={{ flex: 1 }}>
      <Heading data={data} palette={palette} />
      <View style={{ marginTop: 64, gap: 8 }}>
        <CardText size={27} weight="medium" tracking={3} upper color={palette.textMuted}>
          {t("report__muscles")}
        </CardText>
      </View>
      <View style={{ marginTop: 36, gap: 44 }}>
        {rows.map((row) => (
          <View key={row.key} style={{ gap: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 24 }}>
              <View style={{ flex: 1 }}>
                <CardText size={42} weight="semibold" color={palette.text} lines={1}>
                  {t(MUSCLE_GROUP_KEYS[row.muscle])}
                </CardText>
              </View>
              <CardText size={42} weight="semibold" tabular color={palette.text}>
                {formatPercent(row.percent, i18n.language)}
              </CardText>
            </View>
            <View
              style={{
                height: 16,
                borderRadius: 8,
                backgroundColor: palette.plate,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: palette.accent,
                  width: `${(top > 0 ? row.share / top : 0) * 100}%`,
                }}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
