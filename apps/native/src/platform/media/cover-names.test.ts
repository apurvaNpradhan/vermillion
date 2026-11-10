import { describe, expect, it } from "vitest";

import {
  centredSquare,
  coverFileName,
  coverSide,
  orphanedCoverFiles,
  programIdOfCoverFile,
} from "./cover-names";

describe("cover files", () => {
  it("names a file after its Program and reads the id back", () => {
    expect(coverFileName("abc")).toBe("abc.jpg");
    expect(programIdOfCoverFile("abc.jpg")).toBe("abc");
    expect(programIdOfCoverFile(".jpg")).toBeNull();
    expect(programIdOfCoverFile("notes.txt")).toBeNull();
  });

  it("finds the files to delete: covers of other Programs and strays", () => {
    expect(orphanedCoverFiles(["a.jpg", "b.jpg", "c.jpg", "tmp.bin"], ["a", "c"])).toEqual([
      "b.jpg",
      "tmp.bin",
    ]);
    expect(orphanedCoverFiles(["a.jpg"], [])).toEqual(["a.jpg"]);
    expect(orphanedCoverFiles([], ["a"])).toEqual([]);
  });
});

describe("cover geometry", () => {
  it("cuts the centred square of a picture that is not one", () => {
    expect(centredSquare(1000, 1000)).toBeNull();
    expect(centredSquare(4000, 3000)).toEqual({
      originX: 500,
      originY: 0,
      width: 3000,
      height: 3000,
    });
    expect(centredSquare(600, 800)).toEqual({ originX: 0, originY: 100, width: 600, height: 600 });
  });

  it("resizes down to 1024 px and never up", () => {
    expect(coverSide(3000)).toBe(1024);
    expect(coverSide(1024)).toBe(1024);
    expect(coverSide(512)).toBe(512);
  });
});
