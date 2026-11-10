import type { WeightUnit } from "@workspace/shared";
import type { SessionDetail } from "@workspace/sync";
import { doneSummary } from "./summary";

/** All prose, units and formatted times come from the caller's locale. */
export function sessionAsText(
  session: SessionDetail,
  labels: {
    date: string;
    stats: string;
    unit: WeightUnit;
    unitLabel: string;
    kind: (kind: SessionDetail["exercises"][number]["sets"][number]["kind"]) => string;
    effort: (value: number) => string;
  },
): string {
  return [
    session.title,
    labels.date,
    labels.stats,
    session.note,
    ...session.exercises.flatMap((entry) => [
      "",
      entry.title,
      entry.note,
      ...entry.sets.flatMap((set) =>
        set.completedAt === null
          ? []
          : [
              `${labels.kind(set.kind)} · ${doneSummary([{ ...set, kind: "working" }], entry.type, labels.unit, labels.unitLabel)}${set.rpe === null ? "" : ` · ${labels.effort(set.rpe)}`}`,
            ],
      ),
    ]),
  ]
    .filter((line) => line != null)
    .join("\n");
}
