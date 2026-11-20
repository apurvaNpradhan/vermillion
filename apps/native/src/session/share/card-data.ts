import {
  isCounted,
  muscleDistribution,
  type recordFlags,
  sessionTotals,
  type MuscleGroup,
  type MuscleLoad,
} from "@workspace/shared";
import type { SessionDetail } from "@workspace/sync";

import { formatElapsed } from "../timer/clock";
import { loggedSetsOf } from "../logging/set-values";
import { formatDetail, type BestLabels } from "./best-set";
import { topMuscles } from "./muscles";
import { compactRows, shareRows, type ShareRow } from "./rows";
import { sessionDuration } from "./stats";

/** The privacy toggles of a Session card. */
export type SessionToggleId = "weights" | "exercises" | "photo";

/** Everything a Session card says, already formatted, so the card components only draw it. */
export type SessionCardData = {
  title: string;
  /** "Monday 16 November · Evening" */
  date: string;
  stats: { id: "duration" | "volume" | "sets"; label: string; value: string; unit?: string }[];
  /** "3 Records", or null when the Session set none. */
  records: string | null;
  /** The exercise rows; null when Show exercises is off. */
  exercises: {
    items: {
      id: string;
      title: string;
      thumbnailKey: string | null;
      imageMediaId: string | null;
      /** "4 sets · best 100 kg × 5" */
      summary: string;
      record: boolean;
    }[];
    /** "+3 more", or null when everything fits. */
    more: string | null;
  } | null;
  /** The three most worked muscles. */
  muscles: { name: string; sets: string; share: number }[];
  /** All muscle loads, for the body map heat. */
  loads: MuscleLoad[];
};

/** Words and number formats from the user's locale and unit. */
export type SessionCardLabels = BestLabels & {
  date: (startedAt: string) => string;
  statLabel: (id: "duration" | "volume" | "sets") => string;
  /** The volume's number and its unit label, apart so a card can set the unit smaller. */
  volume: (kg: number) => { value: string; unit: string };
  records: (count: number) => string;
  /** `kind` is "reps" when the detail is a rep range rather than a best set. */
  rowSummary: (sets: number, detail: string, kind: "best" | "reps") => string;
  more: (count: number) => string;
  muscleName: (muscle: MuscleGroup) => string;
  muscleSets: (sets: number) => string;
};

/** What a Session card is made of, with the toggles applied. */
export function buildCardData(input: {
  session: SessionDetail;
  /** Which set ids set a Record. */
  flagged: ReturnType<typeof recordFlags>;
  bodyweightKg: number | null;
  countWarmups?: boolean;
  distribution: readonly {
    id: string;
    primary_muscle: MuscleGroup;
    secondary_muscles: readonly MuscleGroup[];
  }[];
  toggles: Readonly<Record<SessionToggleId, boolean>>;
  labels: SessionCardLabels;
}): SessionCardData {
  const { session, flagged, bodyweightKg, toggles, labels } = input;
  const countWarmups = input.countWarmups ?? false;
  const sets = loggedSetsOf(session, countWarmups);
  const totals = sessionTotals(sets, bodyweightKg);
  const records = sets
    .filter(isCounted)
    .reduce((count, set) => count + (flagged.get(set.id)?.length ?? 0), 0);
  const rows = shareRows(session, flagged, toggles.weights, countWarmups);
  const { shown, more } = compactRows(rows);
  const loads = muscleDistribution(sets, input.distribution);
  const max = loads[0]?.sets ?? 1;
  return {
    title: session.title,
    date: labels.date(session.startedAt),
    stats: [
      {
        id: "duration",
        label: labels.statLabel("duration"),
        value: formatElapsed(sessionDuration(session)),
      },
      // Volume is a weight: hidden with weights, and absent when nothing moved weight.
      ...(toggles.weights && totals.volume > 0
        ? [
            {
              id: "volume" as const,
              label: labels.statLabel("volume"),
              ...labels.volume(totals.volume),
            },
          ]
        : []),
      { id: "sets", label: labels.statLabel("sets"), value: String(totals.sets) },
    ],
    records: records > 0 ? labels.records(records) : null,
    exercises: toggles.exercises
      ? {
          items: shown.map((row: ShareRow) => ({
            id: row.id,
            title: row.title,
            thumbnailKey: row.thumbnailKey,
            imageMediaId: row.imageMediaId,
            summary: labels.rowSummary(row.sets, formatDetail(row.detail, labels), row.detail.kind),
            record: row.record,
          })),
          more: more > 0 ? labels.more(more) : null,
        }
      : null,
    muscles: topMuscles(loads).map((load) => ({
      name: labels.muscleName(load.muscle),
      sets: labels.muscleSets(load.sets),
      share: load.sets / max,
    })),
    loads,
  };
}
