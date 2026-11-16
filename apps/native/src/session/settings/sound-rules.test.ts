import { describe, expect, it } from "vitest";

import { SOUND_CUES, countdownBeepSecond, cueEnabled, tickCue } from "./sound-rules";

const ALL = { sounds: true, soundRest: true, soundSets: true, soundMilestones: true };

describe("cueEnabled", () => {
  it("plays every cue with everything on", () => {
    for (const cue of SOUND_CUES) expect(cueEnabled(ALL, cue)).toBe(true);
  });
  it("plays nothing with the master switch off", () => {
    for (const cue of SOUND_CUES) expect(cueEnabled({ ...ALL, sounds: false }, cue)).toBe(false);
  });
  it("silences only the cues of a group that is off", () => {
    const rest = { ...ALL, soundRest: false };
    expect(SOUND_CUES.filter((cue) => !cueEnabled(rest, cue))).toEqual([
      "restCountdown",
      "restOver",
      "countdownDone",
    ]);
    const sets = { ...ALL, soundSets: false };
    expect(SOUND_CUES.filter((cue) => !cueEnabled(sets, cue))).toEqual(["tick", "refused"]);
    const milestones = { ...ALL, soundMilestones: false };
    expect(SOUND_CUES.filter((cue) => !cueEnabled(milestones, cue))).toEqual([
      "record",
      "finished",
    ]);
  });
});

describe("tickCue", () => {
  it("is the plain tick by default", () => {
    expect(tickCue(ALL, { record: false, countdown: false })).toBe("tick");
  });
  it("prefers a record, then a finished countdown", () => {
    expect(tickCue(ALL, { record: true, countdown: false })).toBe("record");
    expect(tickCue(ALL, { record: true, countdown: true })).toBe("record");
    expect(tickCue(ALL, { record: false, countdown: true })).toBe("countdownDone");
  });
  it("falls through to the next cue when a group is off", () => {
    expect(tickCue({ ...ALL, soundMilestones: false }, { record: true, countdown: true })).toBe(
      "countdownDone",
    );
    expect(
      tickCue(
        { ...ALL, soundMilestones: false, soundRest: false },
        { record: true, countdown: true },
      ),
    ).toBe("tick");
    expect(tickCue({ ...ALL, soundSets: false }, { record: false, countdown: false })).toBeNull();
  });
  it("is silent with the master switch off", () => {
    expect(tickCue({ ...ALL, sounds: false }, { record: true, countdown: true })).toBeNull();
  });
});

describe("countdownBeepSecond", () => {
  it("beeps at 3, 2 and 1 only", () => {
    expect([0, 1, 2, 3, 4, 10].map(countdownBeepSecond)).toEqual([null, 1, 2, 3, null, null]);
  });
});
