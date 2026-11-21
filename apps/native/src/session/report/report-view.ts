import type { Change, ExerciseTotal, PeriodReport } from "./period-report";

export type StatId = "sessions" | "days" | "sets" | "volume" | "time";

/** Words and number formats from the user's locale and unit; the view only places them. */
export type ReportLabels = {
  statLabel: (id: StatId) => string;
  count: (value: number) => string;
  /** The volume's number and its unit apart, so a card can set the unit smaller. */
  volume: (kg: number) => { value: string; unit: string };
  time: (seconds: number) => { value: string; unit: string };
  percent: (value: number) => string;
  sets: (count: number) => string;
  records: (count: number) => string;
  streak: (weeks: number) => string;
  /** "vs October", naming the period compared with. */
  versus: string;
};

export type StatView = {
  id: StatId;
  label: string;
  value: string;
  unit?: string;
  /** "12%" with its direction; null when there is nothing to compare. */
  change: { direction: Change["direction"]; text: string } | null;
};

export type ReportView = {
  stats: StatView[];
  records: string | null;
  streak: string | null;
  versus: string | null;
  topBySets: { id: string; title: string; value: string }[];
  topByVolume: { id: string; title: string; value: string }[];
};

/** The time trained as minutes under two hours, otherwise hours with one decimal. */
export function trainedTime(seconds: number): { unit: "min" | "h"; value: number } {
  const minutes = Math.round(seconds / 60);
  return minutes < 120
    ? { unit: "min", value: minutes }
    : { unit: "h", value: Math.round(seconds / 360) / 10 };
}

const changeView = (change: Change | null, labels: ReportLabels): StatView["change"] =>
  change === null ? null : { direction: change.direction, text: labels.percent(change.percent) };

const topRows = (
  rows: readonly ExerciseTotal[],
  value: (row: ExerciseTotal) => string,
): ReportView["topBySets"] =>
  rows.map((row) => ({ id: row.exerciseId, title: row.title, value: value(row) }));

/**
 * What the report screen and its share card show, already formatted: five figures (with the
 * change since the previous period where there is one), the Records, the longest goal streak and
 * the top exercises. Volume is absent when nothing moved weight and there is no volume to compare
 * with (a fall to nothing from a heavier period is still shown).
 */
export function buildReportView(report: PeriodReport, labels: ReportLabels): ReportView {
  const { stats, changes } = report;
  const volume = labels.volume(stats.volume);
  const time = labels.time(stats.seconds);
  return {
    stats: [
      {
        id: "sessions",
        label: labels.statLabel("sessions"),
        value: labels.count(stats.workouts),
        change: changeView(changes.workouts, labels),
      },
      {
        id: "days",
        label: labels.statLabel("days"),
        value: labels.count(stats.trainingDays),
        change: null,
      },
      {
        id: "sets",
        label: labels.statLabel("sets"),
        value: labels.count(stats.sets),
        change: changeView(changes.sets, labels),
      },
      ...(stats.volume > 0 || changes.volume !== null
        ? [
            {
              id: "volume" as const,
              label: labels.statLabel("volume"),
              ...volume,
              change: changeView(changes.volume, labels),
            },
          ]
        : []),
      {
        id: "time",
        label: labels.statLabel("time"),
        ...time,
        change: changeView(changes.seconds, labels),
      },
    ],
    records: report.records > 0 ? labels.records(report.records) : null,
    streak: report.longestStreak > 0 ? labels.streak(report.longestStreak) : null,
    versus: report.previous === null ? null : labels.versus,
    topBySets: topRows(report.topBySets, (row) => labels.sets(row.sets)),
    topByVolume: topRows(report.topByVolume, (row) => {
      const { value, unit } = labels.volume(row.volume);
      return `${value} ${unit}`;
    }),
  };
}

/** The share card's visible rows after applying its Show weights toggle. */
export function reportShareStats(view: ReportView, showWeights: boolean): StatView[] {
  return showWeights ? view.stats : view.stats.filter((stat) => stat.id !== "volume");
}
