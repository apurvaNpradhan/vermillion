import { muscleShares } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import type { PeriodReport } from "./period-report";
import { buildReportView, reportShareStats, trainedTime, type ReportLabels } from "./report-view";

const labels: ReportLabels = {
  statLabel: (id) => id,
  count: String,
  volume: (kg) => ({ value: String(kg / 1000), unit: "t" }),
  time: (seconds) => ({ value: String(seconds), unit: "s" }),
  percent: (value) => `${value}%`,
  sets: (count) => `${count} sets`,
  records: (count) => `${count} records`,
  streak: (weeks) => `${weeks} weeks`,
  versus: "vs previous",
};

const report = (patch: Partial<PeriodReport> = {}): PeriodReport => ({
  period: { kind: "month", start: Date.UTC(2026, 9, 1) },
  stats: { workouts: 12, trainingDays: 11, sets: 200, volume: 40_000, seconds: 36_000 },
  previous: { workouts: 10, trainingDays: 10, sets: 250, volume: 40_000, seconds: 30_000 },
  changes: {
    workouts: { direction: "up", percent: 20 },
    sets: { direction: "down", percent: 20 },
    volume: { direction: "same", percent: 0 },
    seconds: { direction: "up", percent: 20 },
  },
  records: 3,
  topBySets: [{ exerciseId: "a", title: "Bench", sets: 30, volume: 9000 }],
  topByVolume: [{ exerciseId: "a", title: "Bench", sets: 30, volume: 9000 }],
  shares: muscleShares([], []),
  longestStreak: 4,
  ...patch,
});

describe("trainedTime", () => {
  it("reads minutes under two hours and hours after", () => {
    expect(trainedTime(45 * 60)).toEqual({ unit: "min", value: 45 });
    expect(trainedTime(10 * 3600)).toEqual({ unit: "h", value: 10 });
    expect(trainedTime(2.55 * 3600)).toEqual({ unit: "h", value: 2.6 });
  });
});

describe("buildReportView", () => {
  it("places the figures with their changes", () => {
    const view = buildReportView(report(), labels);
    expect(view.stats.map((stat) => stat.id)).toEqual([
      "sessions",
      "days",
      "sets",
      "volume",
      "time",
    ]);
    expect(view.stats[0]?.change).toEqual({ direction: "up", text: "20%" });
    expect(view.stats[1]?.change).toBeNull();
    expect(view.versus).toBe("vs previous");
    expect(view.records).toBe("3 records");
    expect(view.streak).toBe("4 weeks");
    expect(view.topBySets).toEqual([{ id: "a", title: "Bench", value: "30 sets" }]);
    expect(view.topByVolume[0]?.value).toBe("9 t");
  });

  it("leaves out what is absent", () => {
    const view = buildReportView(
      report({
        previous: null,
        records: 0,
        longestStreak: 0,
        stats: { workouts: 1, trainingDays: 1, sets: 5, volume: 0, seconds: 60 },
        changes: { workouts: null, sets: null, volume: null, seconds: null },
      }),
      labels,
    );
    expect(view.stats.map((stat) => stat.id)).not.toContain("volume");
    expect(view.versus).toBeNull();
    expect(view.records).toBeNull();
    expect(view.streak).toBeNull();
    expect(view.stats.every((stat) => stat.change === null)).toBe(true);
  });

  it("shows volume that fell to nothing against a heavier period", () => {
    const view = buildReportView(
      report({
        stats: { workouts: 1, trainingDays: 1, sets: 5, volume: 0, seconds: 60 },
        changes: {
          workouts: null,
          sets: null,
          volume: { direction: "down", percent: 100 },
          seconds: null,
        },
      }),
      labels,
    );
    expect(reportShareStats(view, true).find((stat) => stat.id === "volume")?.change).toEqual({
      direction: "down",
      text: "100%",
    });
    expect(reportShareStats(view, false).map((stat) => stat.id)).not.toContain("volume");
  });
});
