import { describe, expect, it } from "vitest";

import { NO_PENDING, previewTick as preview } from "../logging/optimistic";
import { exercise, session, set, twoExercises } from "./fixtures";
import { createSessionStore } from "./session-store";

const NOW = "2026-11-21T10:05:00.000Z";

/** What `useOptimisticSession` does for a tick, on the store alone. */
function previewTick(store: ReturnType<typeof createSessionStore>, setId: string, saved = false) {
  const state = store.getState();
  const at = state.found.get(setId);
  if (!at) throw new Error("missing set");
  const result = preview(at.set, at.exercise.type, { weight: 60, reps: 8 }, NOW);
  if (result.kind !== "ok") throw new Error("refused");
  state.updatePending((current) => [
    ...current,
    { id: Symbol(), saved, set: { id: setId, before: at.set, value: result.change } },
  ]);
}

describe("the session store", () => {
  it("shows a pending tick at once and touches only that set and its exercise", () => {
    const store = createSessionStore(twoExercises());
    const before = store.getState();
    previewTick(store, "b2");
    const after = store.getState();
    expect(after.setsById.get("b2")?.completedAt).toBe(NOW);
    expect(after.setsById.get("b1")).toBe(before.setsById.get("b1"));
    expect(after.exercises.get("a")).toBe(before.exercises.get("a"));
    expect(after.exercises.get("b")).not.toBe(before.exercises.get("b"));
    expect(after.views.get("a")).toBe(before.views.get("a"));
    expect(after.views.get("b")?.progress).toBe("1/3");
    expect(after.views.get("b")?.rows.get("b1")).toBe(before.views.get("b")?.rows.get("b1"));
    expect(after.exerciseIds).toBe(before.exerciseIds);
    expect(after.stats).toMatchObject({ ticked: 1, unticked: 4 });
  });

  it("keeps the shown Session when the watch delivers what is already shown", () => {
    const stored = twoExercises();
    const store = createSessionStore(stored);
    previewTick(store, "b2", true);
    const shown = store.getState().session;
    const delivered = session([
      stored.exercises[0] ?? exercise("a", []),
      exercise("b", [
        set("b1"),
        set("b2", { weightKg: 60, reps: 8, completedAt: NOW, timerStartedAt: null }),
        set("b3"),
      ]),
    ]);
    store.getState().setStored(delivered);
    const after = store.getState();
    // The pending change is spent, and the Session is the object it was.
    expect(after.pending.length).toBe(0);
    expect(after.session).toBe(shown);
    expect(after.views.get("b")).toBeDefined();
  });

  it("takes the pending change back when it is dropped", () => {
    const store = createSessionStore(twoExercises());
    previewTick(store, "b2");
    store.getState().updatePending(() => NO_PENDING);
    expect(store.getState().setsById.get("b2")?.completedAt).toBeNull();
    expect(store.getState().views.get("b")?.progress).toBe("0/3");
  });

  it("shows a pending Rest and a Rest target over the stored one", () => {
    const store = createSessionStore(twoExercises());
    const rest = { setId: "a1", startedAt: NOW, endsAt: "2026-11-21T10:06:30.000Z" };
    store
      .getState()
      .updatePending((current) => [
        ...current,
        { id: Symbol(), saved: true, rest: { before: null, value: { value: rest } } },
      ]);
    expect(store.getState().session.rest).toEqual(rest);
    store.getState().setRestTarget(null);
    expect(store.getState().session.rest).toBeNull();
  });

  it("changes the keypad's text without touching the Session or the views", () => {
    const store = createSessionStore(twoExercises());
    const before = store.getState();
    const cell = { setId: "a1", field: "weight" } as const;
    store.getState().setEntry({ cell, raw: "6", fresh: false });
    store.getState().setEntry({ cell, raw: "62", fresh: false });
    const after = store.getState();
    expect(after.cell).toBe(cell);
    expect(after.raw).toBe("62");
    expect(after.session).toBe(before.session);
    expect(after.views).toBe(before.views);
  });

  it("closes the keypad when its set goes away or the Session turns read-only", () => {
    const store = createSessionStore(twoExercises());
    store.getState().setEntry({ cell: { setId: "b3", field: "reps" }, raw: "", fresh: true });
    store
      .getState()
      .setStored(
        session([
          exercise("a", [set("a1", { weightKg: 60 }), set("a2", { weightKg: 60 })]),
          exercise("b", [set("b1"), set("b2")]),
        ]),
      );
    expect(store.getState().cell).toBeNull();

    store.getState().setEntry({ cell: { setId: "a1", field: "reps" }, raw: "", fresh: true });
    store.getState().setUi({ ...store.getState().ui, readOnly: true });
    expect(store.getState().cell).toBeNull();
  });

  it("points at the set to log next, following the exercise being worked on", () => {
    const store = createSessionStore(twoExercises());
    expect(store.getState().currentSetId).toBe("a1");
    store.getState().setFocusedExercise("b");
    expect(store.getState().currentSetId).toBe("b1");
    store.getState().setUi({ ...store.getState().ui, readOnly: true });
    expect(store.getState().currentSetId).toBeNull();
  });

  it("keeps the stats object while the numbers hold", () => {
    const store = createSessionStore(twoExercises());
    const before = store.getState().stats;
    store.getState().setFocusedExercise("b");
    expect(store.getState().stats).toBe(before);
  });
  describe("the accordion", () => {
    it("starts with the first unfinished exercise open", () => {
      const store = createSessionStore(twoExercises());
      expect([...store.getState().expanded]).toEqual(["a"]);
    });

    it("closes an exercise when its last set is ticked, opens the next and asks to scroll to it", () => {
      const store = createSessionStore(twoExercises());
      previewTick(store, "a1", true);
      store.getState().advanceAfterTick("a1", NOW);
      expect([...store.getState().expanded]).toEqual(["a"]);
      previewTick(store, "a2", true);
      expect([...store.getState().expanded]).toEqual(["a"]);
      store.getState().advanceAfterTick("a2", NOW);
      expect([...store.getState().expanded]).toEqual(["b"]);
      expect(store.getState().scrollRequest).toEqual({ exerciseId: "b", nonce: 1 });
    });

    it("leaves the accordion in place when a remote tick, retick, or deletion finishes a block", () => {
      const open = exercise("a", [set("a1", { completedAt: NOW }), set("a2")]);
      const done = exercise("a", [
        set("a1", { completedAt: NOW }),
        set("a2", { completedAt: NOW }),
      ]);
      const next = exercise("b", [set("b1")]);
      const store = createSessionStore(session([open, next]));
      const expanded = store.getState().expanded;
      store.getState().setStored(session([done, next]));
      store.getState().setStored(session([open, next]));
      store.getState().setStored(session([done, next]));
      store.getState().setStored(session([open, next]));
      store.getState().setStored(session([exercise("a", [set("a1", { completedAt: NOW })]), next]));
      expect(store.getState().expanded).toBe(expanded);
      expect(store.getState().scrollRequest).toBeNull();
    });

    it("keeps a local final tick open while earlier ticks are pending or a warm-up is added", () => {
      const store = createSessionStore(twoExercises());
      previewTick(store, "a1");
      previewTick(store, "a2", true);
      store.getState().advanceAfterTick("a2", NOW);
      expect(store.getState().scrollRequest).toBeNull();

      const next = exercise("b", [set("b1")]);
      store
        .getState()
        .setStored(
          session([
            exercise("a", [
              set("w", { kind: "warmup" }),
              set("a1", { completedAt: NOW }),
              set("a2"),
            ]),
            next,
          ]),
        );
      store.getState().advanceAfterTick("a2", NOW);
      expect([...store.getState().expanded]).toEqual(["a"]);
      expect(store.getState().scrollRequest).toBeNull();
    });

    it("toggles every member from either header and clears hidden keypad and refusal state", () => {
      const store = createSessionStore(
        session([
          exercise("a", [set("a1")]),
          exercise("b", [set("b1")], { supersetGroup: "group" }),
          exercise("c", [set("c1")], { supersetGroup: "group" }),
        ]),
      );
      store.getState().toggleExpanded("c");
      expect([...store.getState().expanded]).toEqual(["a", "b", "c"]);
      store.getState().setEntry({ cell: { setId: "c1", field: "reps" }, raw: "", fresh: true });
      store.getState().setRefusal({ setId: "c1", fields: ["reps"] });
      store.getState().toggleExpanded("b");
      expect([...store.getState().expanded]).toEqual(["a"]);
      expect(store.getState().cell).toBeNull();
      expect(store.getState().refusal).toBeNull();

      store.getState().setEntry({ cell: { setId: "b1", field: "reps" }, raw: "", fresh: true });
      expect([...store.getState().expanded]).toEqual(["a", "b", "c"]);
    });

    it("advances after both superset members are saved and cancels the reveal if its target closes", () => {
      const store = createSessionStore(
        session([
          exercise("a", [set("a1")], { supersetGroup: "group" }),
          exercise("b", [set("b1")], { supersetGroup: "group" }),
          exercise("c", [set("c1")]),
        ]),
      );
      previewTick(store, "a1", true);
      store.getState().advanceAfterTick("a1", NOW);
      expect([...store.getState().expanded]).toEqual(["a", "b"]);
      previewTick(store, "b1", true);
      store.getState().advanceAfterTick("b1", NOW);
      expect([...store.getState().expanded]).toEqual(["c"]);
      expect(store.getState().currentSetId).toBe("c1");
      expect(store.getState().scrollRequest?.exerciseId).toBe("c");
      store.getState().toggleExpanded("c");
      expect(store.getState().scrollRequest).toBeNull();
    });

    it("drops a keypad and refusal for a slot reused by a replacement exercise", () => {
      const store = createSessionStore(twoExercises());
      store.getState().setEntry({ cell: { setId: "a1", field: "reps" }, raw: "", fresh: true });
      store.getState().setRefusal({ setId: "a1", fields: ["reps"] });
      store
        .getState()
        .setStored(
          session([
            exercise("a", [set("a1")], { exerciseId: "replacement" }),
            exercise("b", [set("b1")]),
          ]),
        );
      expect(store.getState().cell).toBeNull();
      expect(store.getState().refusal).toBeNull();
      expect(store.getState().expanded.has("a")).toBe(true);
    });

    it("lets the user open several exercises and close one", () => {
      const store = createSessionStore(twoExercises());
      store.getState().toggleExpanded("b");
      expect([...store.getState().expanded].toSorted()).toEqual(["a", "b"]);
      store.getState().toggleExpanded("a");
      expect([...store.getState().expanded]).toEqual(["b"]);
    });

    it("opens the exercise of a cell the keypad targets, and closes the keypad with its exercise", () => {
      const store = createSessionStore(twoExercises());
      store.getState().setEntry({ cell: { setId: "b2", field: "weight" }, raw: "", fresh: true });
      expect(store.getState().expanded.has("b")).toBe(true);
      store.getState().toggleExpanded("b");
      expect(store.getState().cell).toBeNull();
    });
  });
});
