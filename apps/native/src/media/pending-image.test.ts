import { describe, expect, it } from "vitest";
import { createPendingImage } from "./pending-image";

describe("draft image ownership", () => {
  it("discards on replacement, removal and unmount, including a late picker result", () => {
    const discarded: string[] = [];
    const draft = createPendingImage((image: string) => {
      discarded.push(image);
    });
    draft.replace("first");
    draft.replace("second");
    expect(discarded).toEqual(["first"]);
    draft.replace(null);
    expect(discarded).toEqual(["first", "second"]);
    draft.replace("third");
    draft.dispose();
    draft.replace("late");
    expect(discarded).toEqual(["first", "second", "third", "late"]);
  });
});
