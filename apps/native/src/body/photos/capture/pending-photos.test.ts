import { describe, expect, it } from "vitest";

import type { ProcessedImage } from "@/media";

import { createPendingPhotos } from "./pending-photos";

const image = (name: string): ProcessedImage => ({
  fullUri: `file:///cache/${name}.jpg`,
  thumbUri: `file:///cache/${name}_t.jpg`,
  width: 1536,
  height: 2048,
  bytes: 1,
  thumbBytes: 1,
});

function setup() {
  const deleted: string[] = [];
  const store = createPendingPhotos((photo) => deleted.push(photo.fullUri));
  return { store, deleted };
}

describe("photos pending in a Check-in", () => {
  it("deletes a photo that is replaced, and keeps the new one", () => {
    const { store, deleted } = setup();
    const first = image("first");
    const second = image("second");
    store.set("front", first);
    store.set("front", second);
    expect(deleted).toEqual([first.fullUri]);
    expect(store.getSnapshot()).toEqual({ front: second });
  });

  it("deletes a photo that is removed", () => {
    const { store, deleted } = setup();
    const photo = image("front");
    store.set("front", photo);
    store.remove("front");
    store.remove("front");
    expect(deleted).toEqual([photo.fullUri]);
    expect(store.getSnapshot()).toEqual({});
  });

  it("deletes everything when the sheet goes without saving", () => {
    const { store, deleted } = setup();
    store.set("front", image("front"));
    store.set("side", image("side"));
    store.dispose();
    expect(deleted.sort()).toEqual(["file:///cache/front.jpg", "file:///cache/side.jpg"]);
    expect(store.getSnapshot()).toEqual({});
  });

  it("deletes a photo that arrives after the sheet is gone", () => {
    const { store, deleted } = setup();
    store.dispose();
    store.set("back", image("late"));
    expect(deleted).toEqual(["file:///cache/late.jpg"]);
    expect(store.getSnapshot()).toEqual({});
  });

  it("takes photos again once the sheet is reopened", () => {
    const { store, deleted } = setup();
    store.dispose();
    store.reopen();
    store.set("front", image("front"));
    expect(deleted).toEqual([]);
    expect(store.getSnapshot()).toHaveProperty("front");
  });

  it("deletes nothing on release: a saved photo's files belong to the queue", () => {
    const { store, deleted } = setup();
    store.set("front", image("front"));
    store.release();
    store.dispose();
    expect(deleted).toEqual([]);
  });

  it("notifies subscribers of every change", () => {
    const { store } = setup();
    let calls = 0;
    const stop = store.subscribe(() => (calls += 1));
    store.set("front", image("front"));
    store.remove("front");
    stop();
    store.set("side", image("side"));
    expect(calls).toBe(2);
  });
});
