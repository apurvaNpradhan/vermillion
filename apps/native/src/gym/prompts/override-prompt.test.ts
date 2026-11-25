import { describe, expect, it } from "vitest";

import { KG_PER_LB, type OverridePrompt } from "@workspace/shared";

import {
  dismissOverridePrompt,
  noteOverride,
  observeRepRange,
  observeStep,
  pendingOverridePrompt,
  rangePromptKey,
  stepPromptKey,
  type PromptPlace,
  type RangeSet,
} from "./override-prompt";

const key = stepPromptKey("gym", "press");
const rangeKey = rangePromptKey("slot");
const place = (sessionId: string, over: Partial<PromptPlace> = {}): PromptPlace => ({
  sessionId,
  exerciseId: "press",
  gymId: "gym",
  workoutExerciseId: "slot",
  ...over,
});

describe("observeStep", () => {
  it.each([
    { name: "kg", unit: 1, suggested: 62.5, logged: 65, change: 2.5, step: 5 },
    { name: "lb", unit: KG_PER_LB, suggested: 140, logged: 145, change: 5, step: 10 },
  ])(
    "reads the step taken over a suggested add in $name",
    ({ unit, suggested, logged, change, step }) => {
      const observed = observeStep({
        suggestedKg: suggested * unit,
        loggedKg: logged * unit,
        outcome: { reason: "add_weight", changeKg: change * unit },
      });
      expect(observed).toEqual({ value: expect.closeTo(step * unit, 6) });
    },
  );

  it("follows the suggestion, or says nothing when it was not an add", () => {
    expect(
      observeStep({
        suggestedKg: 62.5,
        loggedKg: 62.5,
        outcome: { reason: "add_weight", changeKg: 2.5 },
      }),
    ).toBe("followed");
    expect(
      observeStep({ suggestedKg: 60, loggedKg: 70, outcome: { reason: "same_as_last" } }),
    ).toBeNull();
    expect(observeStep({ suggestedKg: 60, loggedKg: 70, outcome: null })).toBeNull();
    // Going below the last load is not a step.
    expect(
      observeStep({
        suggestedKg: 62.5,
        loggedKg: 55,
        outcome: { reason: "add_weight", changeKg: 2.5 },
      }),
    ).toBeNull();
  });
});

describe("observeRepRange", () => {
  const target = { kind: "working", reps_min: 8, reps_max: 12 } as const;
  const sets = (reps: readonly (number | null)[], over: Partial<RangeSet> = {}): RangeSet[] =>
    reps.map((count) => ({
      kind: "working",
      completed: count !== null,
      reps: count,
      target,
      ...over,
    }));

  it("reads the Session as a whole: most sets above the top, using the lowest of them", () => {
    expect(observeRepRange(sets([14, 15, 14, 15]))).toEqual({
      value: 14,
      range: { min: 8, max: 12 },
    });
    expect(observeRepRange(sets([15, 15, 12]))).toEqual({
      value: 15,
      range: { min: 8, max: 12 },
    });
    // Half is not most; within the range follows the plan.
    expect(observeRepRange(sets([15, 15, 12, 12]))).toBe("followed");
    expect(observeRepRange(sets([12, 12, 11]))).toBe("followed");
  });

  it("waits until every set that has a range is ticked", () => {
    expect(observeRepRange(sets([15, 15, null]))).toBeNull();
    expect(observeRepRange([])).toBeNull();
  });

  it("reads only progressing sets that have a range", () => {
    const mixed: RangeSet[] = [
      ...sets([15, 15]),
      ...sets([30], { kind: "warmup" }),
      ...sets([4], { kind: "drop" }),
      ...sets([20], { target: { kind: "working", reps_min: 10, reps_max: 10 } }),
      ...sets([3], { target: { kind: "working" } }),
    ];
    expect(observeRepRange(mixed)).toEqual({ value: 15, range: { min: 8, max: 12 } });
    expect(observeRepRange(sets([20], { kind: "warmup" }))).toBeNull();
    expect(observeRepRange(sets([15], { kind: "top" }))).toMatchObject({ value: 15 });
    expect(observeRepRange(sets([15], { kind: "backoff" }))).toMatchObject({ value: 15 });
  });

  it("reads sets that did the suggested reps as following the plan, even past the top", () => {
    // The engine asked for 13 and 14 on a range topping at 12 (more reps before a big jump).
    const asked = (reps: readonly number[], suggested: readonly number[]) =>
      reps.map((count, index) => ({
        kind: "working" as const,
        completed: true,
        reps: count,
        target,
        suggestedReps: suggested[index] ?? null,
      }));
    expect(observeRepRange(asked([13, 13, 13], [13, 13, 13]))).toBe("followed");
    // Going past the asked reps is still an override.
    expect(observeRepRange(asked([16, 16, 16], [13, 13, 13]))).toEqual({
      value: 16,
      range: { min: 8, max: 12 },
    });
    // Most of the sets must be above the top on their own, not on the engine's asking.
    expect(observeRepRange(asked([13, 13, 15], [13, 13, 13]))).toBe("followed");
  });

  it("reads the commonest range when sets differ", () => {
    const other = { kind: "working", reps_min: 15, reps_max: 20 } as const;
    expect(observeRepRange([...sets([13, 14, 13]), ...sets([16], { target: other })])).toEqual({
      value: 13,
      range: { min: 8, max: 12 },
    });
  });
});

describe("noteOverride", () => {
  const note = (
    prompts: ReturnType<typeof noteOverride>,
    sessionId: string,
    observation: Parameters<typeof noteOverride>[1]["observation"],
  ) => noteOverride(prompts ?? [], { key, kind: "step", sessionId, observation }) ?? prompts ?? [];

  it("asks after the same step in two different Sessions, not before", () => {
    const first = note([], "s1", { value: 5 });
    expect(pendingOverridePrompt(first, place("s1"))).toBeUndefined();
    // A second set of the same Session counts once.
    expect(note(first, "s1", { value: 5 })).toEqual(first);
    const second = note(first, "s2", { value: 5 });
    expect(pendingOverridePrompt(second, place("s2"))).toMatchObject({
      value: 5,
      count: 2,
    });
    // It belongs to the Session that made it, the gym and the exercise.
    expect(pendingOverridePrompt(second, place("s1"))).toBeUndefined();
    expect(pendingOverridePrompt(second, place("s2", { gymId: "other" }))).toBeUndefined();
    expect(pendingOverridePrompt(second, place("s2", { exerciseId: "curl" }))).toBeUndefined();
  });

  it("starts again for a different step and forgets after following the suggestion", () => {
    const first = note([], "s1", { value: 5 });
    expect(note(first, "s2", { value: 2 })[0]).toMatchObject({ value: 2, count: 1 });
    expect(note(first, "s2", "followed")).toEqual([]);
    expect(note([], "s2", "followed")).toEqual([]);
    expect(noteOverride([], { key, kind: "step", sessionId: "s2", observation: null })).toBeNull();
  });

  it("treats lb-sized steps as the same step", () => {
    const step = 5 * KG_PER_LB;
    const first = note([], "s1", { value: step });
    expect(note(first, "s2", { value: 5 * KG_PER_LB + 0.001 })[0]?.count).toBe(2);
  });

  it("treats near-equal rep counts as the same range signal, and keeps the lower", () => {
    const range = { min: 8, max: 12 };
    const rangeNote = (
      prompts: Parameters<typeof noteOverride>[0],
      session: string,
      reps: number,
      seen = range,
    ) =>
      noteOverride(prompts, {
        key: rangeKey,
        kind: "range",
        sessionId: session,
        observation: { value: reps, range: seen },
      }) ?? [...prompts];
    const first = rangeNote([], "s1", 15);
    expect(first[0]).toMatchObject({ value: 15, count: 1, rangeMin: 8, rangeMax: 12 });
    const second = rangeNote(first, "s2", 14);
    expect(second[0]).toMatchObject({ value: 14, count: 2 });
    expect(pendingOverridePrompt(second, place("s2"))).toMatchObject({ kind: "range", value: 14 });
    // Further apart, or against another planned range, starts again.
    expect(rangeNote(first, "s2", 13)[0]).toMatchObject({ value: 13, count: 1 });
    expect(rangeNote(first, "s2", 15, { min: 6, max: 10 })[0]).toMatchObject({
      count: 1,
      rangeMin: 6,
    });
  });

  it("belongs to the Workout exercise, whatever the gym", () => {
    const asked: OverridePrompt[] = [
      {
        key: rangeKey,
        kind: "range",
        value: 15,
        count: 2,
        sessionId: "s2",
        dismissed: false,
        rangeMin: 8,
        rangeMax: 12,
      },
    ];
    expect(pendingOverridePrompt(asked, place("s2", { gymId: null }))).toMatchObject({ value: 15 });
    expect(pendingOverridePrompt(asked, place("s2", { gymId: "elsewhere" }))).toMatchObject({
      value: 15,
    });
    expect(
      pendingOverridePrompt(asked, place("s2", { workoutExerciseId: "other" })),
    ).toBeUndefined();
    expect(pendingOverridePrompt(asked, place("s2", { workoutExerciseId: null }))).toBeUndefined();
  });

  it("asks the step before the range, one at a time", () => {
    const both = [
      ...note(note([], "s1", { value: 5 }), "s2", { value: 5 }),
      {
        key: rangeKey,
        kind: "range" as const,
        value: 15,
        count: 2,
        sessionId: "s2",
        dismissed: false,
      },
    ];
    expect(pendingOverridePrompt(both, place("s2"))?.kind).toBe("step");
  });

  it("falls through to the range question when the step question would not show", () => {
    const both: OverridePrompt[] = [
      ...note(note([], "s1", { value: 5 }), "s2", { value: 5 }),
      {
        key: rangeKey,
        kind: "range",
        value: 15,
        count: 2,
        sessionId: "s2",
        dismissed: false,
        rangeMin: 8,
        rangeMax: 12,
      },
    ];
    expect(
      pendingOverridePrompt(both, place("s2"), (prompt) => prompt.kind === "range")?.kind,
    ).toBe("range");
    expect(pendingOverridePrompt(both, place("s2"), () => false)).toBeUndefined();
  });

  it("never asks again once dismissed, and keeps a bounded list", () => {
    const asked = note(note([], "s1", { value: 5 }), "s2", { value: 5 });
    const dismissed = dismissOverridePrompt(asked, key, "step");
    expect(pendingOverridePrompt(dismissed, place("s2"))).toBeUndefined();
    expect(note(dismissed, "s3", { value: 5 })).toEqual(dismissed);
    let crowded = dismissed;
    for (let index = 0; index < 150; index += 1)
      crowded = dismissOverridePrompt(crowded, `gym:e${index}:step`, "step");
    expect(crowded).toHaveLength(100);
    expect(crowded.at(-1)?.key).toBe("gym:e149:step");
  });

  it("moves a dismissal to the end, and loses open counts before dismissals", () => {
    const old = dismissOverridePrompt([], key, "step");
    const again = dismissOverridePrompt(old, key, "step");
    expect(again).toHaveLength(1);
    // Many open counts crowd the list: the old dismissal stays while the oldest counts leave.
    let prompts = dismissOverridePrompt([], key, "step");
    for (let index = 0; index < 150; index += 1)
      prompts =
        noteOverride(prompts, {
          key: `gym:e${index}:step`,
          kind: "step",
          sessionId: "s1",
          observation: { value: 5 },
        }) ?? prompts;
    expect(prompts).toHaveLength(100);
    expect(prompts.find((prompt) => prompt.key === key)?.dismissed).toBe(true);
    expect(prompts.at(-1)?.key).toBe("gym:e149:step");
    expect(prompts.some((prompt) => prompt.key === "gym:e0:step")).toBe(false);
  });
});
