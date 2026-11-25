import { describe, expect, it } from "vitest";

import { KG_PER_LB } from "@workspace/shared";

import {
  dismissOverridePrompt,
  noteOverride,
  observeReps,
  observeStep,
  overridePromptKey,
  pendingOverridePrompt,
} from "./override-prompt";

const key = overridePromptKey("gym", "press", "step");
const rangeKey = overridePromptKey("gym", "press", "range");

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

describe("observeReps", () => {
  it("counts reps above the planned maximum and follows anything within", () => {
    expect(observeReps({ loggedReps: 15, targetMax: 12 })).toEqual({ value: 15 });
    expect(observeReps({ loggedReps: 12, targetMax: 12 })).toBe("followed");
    expect(observeReps({ loggedReps: null, targetMax: 12 })).toBeNull();
    expect(observeReps({ loggedReps: 15, targetMax: null })).toBeNull();
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
    expect(pendingOverridePrompt(first, "gym", "press", "s1")).toBeUndefined();
    // A second set of the same Session counts once.
    expect(note(first, "s1", { value: 5 })).toEqual(first);
    const second = note(first, "s2", { value: 5 });
    expect(pendingOverridePrompt(second, "gym", "press", "s2")).toMatchObject({
      value: 5,
      count: 2,
    });
    // It belongs to the Session that made it, the gym and the exercise.
    expect(pendingOverridePrompt(second, "gym", "press", "s1")).toBeUndefined();
    expect(pendingOverridePrompt(second, "other", "press", "s2")).toBeUndefined();
    expect(pendingOverridePrompt(second, "gym", "curl", "s2")).toBeUndefined();
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

  it("compares reps exactly for a range", () => {
    const rangeNote = (
      prompts: Parameters<typeof noteOverride>[0],
      session: string,
      reps: number,
    ) =>
      noteOverride(prompts, {
        key: rangeKey,
        kind: "range",
        sessionId: session,
        observation: { value: reps },
      }) ?? [...prompts];
    const first = rangeNote([], "s1", 15);
    expect(rangeNote(first, "s2", 14)[0]).toMatchObject({ value: 14, count: 1 });
    expect(pendingOverridePrompt(rangeNote(first, "s2", 15), "gym", "press", "s2")).toMatchObject({
      kind: "range",
      value: 15,
    });
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
    expect(pendingOverridePrompt(both, "gym", "press", "s2")?.kind).toBe("step");
  });

  it("never asks again once dismissed, and keeps a bounded list", () => {
    const asked = note(note([], "s1", { value: 5 }), "s2", { value: 5 });
    const dismissed = dismissOverridePrompt(asked, key, "step");
    expect(pendingOverridePrompt(dismissed, "gym", "press", "s2")).toBeUndefined();
    expect(note(dismissed, "s3", { value: 5 })).toEqual(dismissed);
    let crowded = dismissed;
    for (let index = 0; index < 150; index += 1)
      crowded = dismissOverridePrompt(crowded, `gym:e${index}:step`, "step");
    expect(crowded).toHaveLength(100);
    expect(crowded.at(-1)?.key).toBe("gym:e149:step");
  });
});
