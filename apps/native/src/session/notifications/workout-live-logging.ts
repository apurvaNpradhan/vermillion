import {
  phaseLoadOf,
  isTestSingle,
  suggestionContext,
  withWarmupsCounted,
  type Ghosts,
  type SuggestionAccount,
} from "@workspace/shared";
import {
  EXERCISE_HISTORY_SQL,
  parseFinishedSessions,
  readBodyweightsOnDates,
  tickSet,
  type SessionDetail,
  type TrainingDatabase,
} from "@workspace/sync";
import type { GymLoads } from "@/gym";
import { blocksOf } from "../logging/blocks";
import { currentAction, orderedSets } from "../logging/current-action";
import { loggingGhosts } from "../logging/logging-ghosts";
import { restAfterTick } from "../rest/rest-rules";

/**
 * What the notification reads of the account: the same inputs the Session screen builds its
 * suggestions from, so the Done button ticks the value the screen shows.
 */
export type LiveSuggestionAccount = Omit<SuggestionAccount, "unit" | "stallMemory"> & {
  weightUnit: SuggestionAccount["unit"];
  /** The device's memory of stalled notes; absent when none is kept. */
  stallMemory?: SuggestionAccount["stallMemory"];
  timeZone?: string;
  countWarmups?: boolean;
};

const NO_STALL = () => ({ dismissed: false, applied: false });

/** Only the current set can be shown or logged, so only its exercise needs history. */
export async function workoutLiveGhosts(
  db: TrainingDatabase,
  session: SessionDetail,
  options: LiveSuggestionAccount,
  gym: GymLoads,
  sessionGymId: string | null,
) {
  const ghosts = new Map<string, Ghosts>();
  const first = orderedSets(session.exercises).find((item) => item.set.completedAt === null);
  if (!first) return ghosts;
  const { exercise } = first;
  const entries = session.exercises.filter(({ exerciseId }) => exerciseId === exercise.exerciseId);
  const rawHistory = parseFinishedSessions(
    await db.getAll(EXERCISE_HISTORY_SQL, [exercise.exerciseId, exercise.exerciseId]),
  );
  let history = options.countWarmups ? withWarmupsCounted(rawHistory, true) : rawHistory;
  if (exercise.type === "bodyweight_weighted_reps" && history.length > 0) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: options.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const days = history.map((item) => {
      const parts = formatter.formatToParts(new Date(item.started_at));
      return ["year", "month", "day"]
        .map((key) => parts.find((part) => part.type === key)?.value)
        .join("-");
    });
    const weights = await readBodyweightsOnDates(db, [...new Set(days)]);
    history = history.map((item, index) => ({
      ...item,
      sets: item.sets.map((set) => ({
        ...set,
        bodyweight_kg: weights.get(days[index] ?? "") ?? options.bodyweightKg,
      })),
    }));
  }
  const equipment = exercise.exercise?.equipment ?? "other";
  const { weightUnit, stallMemory, ...account } = options;
  const context = suggestionContext(
    history,
    {
      exerciseId: exercise.exerciseId,
      sourceWorkoutExerciseId: exercise.sourceWorkoutExerciseId,
      exerciseOrdinal: entries.indexOf(exercise),
      duplicateEntry: entries.length > 1,
      type: exercise.type,
      equipment,
      unitOverride: exercise.unit,
      workoutId: session.workoutId,
      gymId: sessionGymId,
      phaseLoad: phaseLoadOf(session.phase, session.phaseModifiers),
      grid: gym.gridFor(exercise.exerciseId, equipment, exercise.unit),
      stalls: Boolean(exercise.sourceWorkoutExerciseId),
      stallDeload: exercise.stallDeload,
      testSingle:
        session.phaseModifiers?.test_entry_id === exercise.sourceWorkoutExerciseId &&
        isTestSingle(
          session.phase,
          exercise.sets.map(({ target }) => target),
        ),
    },
    { ...account, unit: weightUnit, stallMemory: stallMemory ?? NO_STALL },
  );
  ghosts.set(first.set.id, loggingGhosts(exercise, first.index, history, context.settings));
  return ghosts;
}

/** Complete the same set that was offered by Done, if it is still current. */
export async function logWorkoutLiveSet(
  db: TrainingDatabase,
  session: SessionDetail,
  ghosts: ReadonlyMap<string, Ghosts>,
  installId: string,
  requestedSetId: string | null,
) {
  const next = currentAction({
    session,
    ghostsFor: (id) => ghosts.get(id) ?? {},
    now: Date.now(),
  }).current;
  if (!next || next.setId !== requestedSetId) return;
  const block = blocksOf(session.exercises).find((item) =>
    item.members.some((exercise) => exercise.id === next.exerciseRowId),
  );
  return tickSet(
    db,
    next.setId,
    ghosts.get(next.setId) ?? {},
    installId,
    block ? restAfterTick(block, next.exerciseRowId, next.setId) : null,
  );
}
