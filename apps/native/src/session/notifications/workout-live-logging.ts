import {
  adjustmentLoadsFor,
  phaseLoadOf,
  gridCapInUnit,
  type Ghosts,
  type SuggestionAccount,
} from "@workspace/shared";
import {
  capturePrescription,
  loadExerciseHistory,
  tickSet,
  type SessionDetail,
  type TrainingDatabase,
} from "@workspace/sync";
import type { GymLoads } from "@/gym";
import { sessionPrescription } from "../../platform/training/session-prescription";
import { blocksOf } from "../logging/blocks";
import { currentAction, orderedSets } from "../logging/current-action";
import { loggingGhosts, prescriptionDraft } from "../logging/logging-ghosts";
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
  writeScope?: string,
) {
  const ghosts = new Map<string, Ghosts>();
  const first = orderedSets(session.exercises).find((item) => item.set.completedAt === null);
  if (!first) return ghosts;
  const { exercise } = first;
  const saved = exercise.prescription?.sets.find(({ id }) => id === first.set.id);
  if (saved) {
    ghosts.set(first.set.id, saved.ghosts);
    return ghosts;
  }
  const entries = session.exercises.filter(({ exerciseId }) => exerciseId === exercise.exerciseId);
  const history = await loadExerciseHistory(db, exercise.exerciseId, {
    type: exercise.type,
    countWarmups: options.countWarmups,
    timeZone: options.timeZone,
    bodyweightKg: options.bodyweightKg,
  });
  const equipment = exercise.exercise?.equipment ?? "other";
  const { weightUnit, stallMemory, ...account } = options;
  const prescribed = sessionPrescription(
    exercise,
    history,
    { ...account, unit: weightUnit, stallMemory: stallMemory ?? NO_STALL },
    {
      workoutId: session.workoutId,
      gymId: sessionGymId,
      grid: gym.gridFor(exercise.exerciseId, equipment, exercise.unit),
      phaseLoad: phaseLoadOf(session.phase, session.phaseModifiers),
      phase: session.phase,
      testEntryId: session.phaseModifiers?.test_entry_id,
      exerciseOrdinal: entries.indexOf(exercise),
      duplicateEntry: entries.length > 1,
      stalls: true,
      suggest: true,
    },
  );
  const ghostsAt = (index: number) => loggingGhosts(exercise, index, prescribed);
  const draft =
    writeScope !== undefined && !exercise.prescription
      ? prescriptionDraft(
          exercise,
          prescribed.progression,
          gridCapInUnit(prescribed.settings.grid ?? null, prescribed.unit),
          ghostsAt,
          sessionGymId,
        )
      : null;
  const captured = draft ? await capturePrescription(db, exercise.id, draft, writeScope) : null;
  ghosts.set(
    first.set.id,
    captured?.sets.find(({ id }) => id === first.set.id)?.ghosts ?? ghostsAt(first.index),
  );
  return ghosts;
}

/** Complete the same set that was offered by Done, if it is still current. */
export async function logWorkoutLiveSet(
  db: TrainingDatabase,
  session: SessionDetail,
  ghosts: ReadonlyMap<string, Ghosts>,
  installId: string,
  requestedSetId: string | null,
  account?: LiveSuggestionAccount,
  gym?: GymLoads,
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
  const exercise = session.exercises.find(({ id }) => id === next.exerciseRowId);
  const equipment = exercise?.exercise?.equipment ?? "other";
  const loads =
    exercise && account && gym
      ? adjustmentLoadsFor(
          { equipment, type: exercise.type, unit: exercise.unit },
          { ...account, unit: account.weightUnit },
          gym.gridFor(exercise.exerciseId, equipment, exercise.unit),
        )
      : undefined;
  return tickSet(
    db,
    next.setId,
    ghosts.get(next.setId) ?? {},
    installId,
    block ? restAfterTick(block, next.exerciseRowId, next.setId) : null,
    undefined,
    undefined,
    loads,
  );
}
