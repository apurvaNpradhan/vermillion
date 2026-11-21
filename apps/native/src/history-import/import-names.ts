import {
  EXERCISE_TITLE_MAX,
  inferEquipment,
  inferExerciseType,
  normalizeExerciseName,
  type CustomExerciseInput,
  type ExerciseMatcher,
  type ExerciseTarget,
  type ImportedSession,
  type ImportedSet,
  type LibraryEntry,
} from "@workspace/shared";

/** Sets kept per name to infer a new exercise's type from; the rest add nothing. */
const SAMPLE_SETS = 200;

/** Ids that start with this are exercises the import will create; the real id comes at the write. */
export const NEW_EXERCISE_PREFIX = "new:";

/** One exercise name in the file and how much of the file uses it. */
export type NameUse = {
  /** The normalized name: `Bench Press (Barbell)` and `bench press barbell` are one. */
  key: string;
  /** The name as first written. */
  name: string;
  sessions: number;
  sets: number;
  sample: ImportedSet[];
};

/** The names a file uses, the most-used first. */
export function collectNames(sessions: readonly ImportedSession[]): NameUse[] {
  const uses = new Map<string, NameUse>();
  for (const session of sessions) {
    const seen = new Set<string>();
    for (const entry of session.exercises) {
      const key = normalizeExerciseName(entry.name);
      if (key === "") continue;
      let use = uses.get(key);
      if (!use) {
        use = { key, name: entry.name, sessions: 0, sets: 0, sample: [] };
        uses.set(key, use);
      }
      if (!seen.has(key)) {
        seen.add(key);
        use.sessions += 1;
      }
      use.sets += entry.sets.length;
      for (const set of entry.sets) {
        if (use.sample.length < SAMPLE_SETS) use.sample.push(set);
      }
    }
  }
  return [...uses.values()].sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
}

/** A name with the library exercise it matched by itself, or none. */
export type NameMatch = { use: NameUse; matched: ExerciseTarget | null };

export function matchNames(
  uses: readonly NameUse[],
  matcher: ExerciseMatcher,
  library: ReadonlyMap<string, LibraryEntry>,
): NameMatch[] {
  return uses.map((use) => {
    const id = matcher(use.name);
    const entry = id === null ? undefined : library.get(id);
    return {
      use,
      matched: entry
        ? { exerciseId: entry.id, title: entry.title, type: entry.exerciseType }
        : null,
    };
  });
}

/** What the user chose for a name no library exercise matched. */
export type Resolution =
  | { kind: "create" }
  | { kind: "skip" }
  | { kind: "mapped"; target: ExerciseTarget };

/**
 * A saved target takes precedence over an automatic match. Resolve its latest title and type
 * from the live library, and ignore ids whose exercises have since been retired.
 */
export function applyRememberedMappings(
  matches: readonly NameMatch[],
  library: ReadonlyMap<string, LibraryEntry>,
  read: (key: string) => string | null,
) {
  const resolutions = new Map<string, Resolution>();
  const reviewed = matches.map((match) => {
    const id = read(match.use.key);
    const entry = id ? library.get(id) : undefined;
    if (!entry) return match;
    resolutions.set(match.use.key, {
      kind: "mapped",
      target: { exerciseId: entry.id, title: entry.title, type: entry.exerciseType },
    });
    return { ...match, matched: null };
  });
  return { matches: reviewed, resolutions };
}

/** The exercise a not-yet-created name will become: its type comes from the sets it logged. */
export function newExerciseTarget(use: NameUse): ExerciseTarget {
  return {
    exerciseId: `${NEW_EXERCISE_PREFIX}${use.key}`,
    title: use.name.slice(0, EXERCISE_TITLE_MAX),
    type: inferExerciseType(use.sample),
  };
}

/** The custom exercise to create for a name: type and equipment read from what the file shows. */
export function newExerciseInput(use: NameUse): CustomExerciseInput {
  const target = newExerciseTarget(use);
  return {
    title: target.title,
    primary_muscle: "other",
    secondary_muscles: [],
    primary_detail: [],
    secondary_detail: [],
    equipment: inferEquipment(use.name, target.type),
    exercise_type: target.type,
    is_full_bodyweight: false,
    instructions: null,
  };
}

/**
 * Maps a name from the file to the exercise it is logged against: the automatic match, else the
 * user's choice for it (create is the default). A skipped name has no target.
 */
export function createResolver(
  matches: readonly NameMatch[],
  resolutions: ReadonlyMap<string, Resolution>,
): (name: string) => ExerciseTarget | null {
  const targets = new Map<string, ExerciseTarget | null>();
  for (const { use, matched } of matches) {
    if (matched) {
      targets.set(use.key, matched);
      continue;
    }
    const choice = resolutions.get(use.key) ?? { kind: "create" };
    targets.set(
      use.key,
      choice.kind === "mapped"
        ? choice.target
        : choice.kind === "create"
          ? newExerciseTarget(use)
          : null,
    );
  }
  return (name) => targets.get(normalizeExerciseName(name)) ?? null;
}
