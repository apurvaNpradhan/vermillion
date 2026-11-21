import { sessionRecordFlags, type ExerciseBests, type LoggedSet } from "@workspace/shared";

type Bests = Map<string, ExerciseBests>;

type CachedBests = {
  value: Bests | null;
  ready: Promise<Bests | null>;
};

/** Deduplicates in-flight reads and keeps only the computed bests for each exercise. */
export function createRecordBestsCache(read: (exerciseId: string) => Promise<Bests>) {
  const entries = new Map<string, CachedBests>();
  return {
    clear: () => entries.clear(),
    get(exerciseId: string): CachedBests {
      const existing = entries.get(exerciseId);
      if (existing) return existing;
      const entry: CachedBests = {
        value: null,
        ready: Promise.resolve()
          .then(() => read(exerciseId))
          .then(
            (value) => {
              if (entries.get(exerciseId) !== entry) return null;
              entry.value = value;
              return value;
            },
            () => {
              if (entries.get(exerciseId) === entry) entries.delete(exerciseId);
              return null;
            },
          ),
      };
      entries.set(exerciseId, entry);
      return entry;
    },
  };
}

/** A live tick uses the same metrics and earlier-session comparison as the finish summary. */
export function tickedSetIsRecord(input: {
  bests: Bests;
  sets: readonly LoggedSet[];
  setId: string;
  bodyweightKg: number | null;
}): boolean {
  return sessionRecordFlags(input.sets, input.bests, input.bodyweightKg).has(input.setId);
}
