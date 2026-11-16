import { describe, expect, it } from "vitest";

import { folderOf, isInsideRoot, relativePath } from "./files";

const ID = "0192f3c4-7a5b-7c3e-8d1a-123456789abc";

describe("media file paths", () => {
  it("keeps thumbnails and full images in their own folders", () => {
    expect(folderOf(`${ID}.jpg`)).toBe("full");
    expect(folderOf(`${ID}_t.jpg`)).toBe("thumb");
    expect(relativePath(`${ID}.jpg`)).toBe(`media/full/${ID}.jpg`);
    expect(relativePath(`${ID}_t.jpg`)).toBe(`media/thumb/${ID}_t.jpg`);
  });

  it("refuses a file name that is not a media file", () => {
    for (const name of [
      "../../secrets.jpg",
      `../${ID}.jpg`,
      `${ID}.jpg/../../x`,
      `${ID}/x.jpg`,
      "x.jpg",
      `${ID}.png`,
      `${ID}_t.jpg.bak`,
      "",
    ]) {
      expect(() => relativePath(name)).toThrow();
    }
  });
});

describe("media root", () => {
  const root = "file:///data/user/0/app/files/media/";

  it("holds the files under it", () => {
    expect(isInsideRoot(`${root}full/${ID}.jpg`, root)).toBe(true);
    expect(isInsideRoot(`/data/user/0/app/files/media/thumb/${ID}_t.jpg`, root)).toBe(true);
  });

  it("refuses paths that leave it, however they are spelled", () => {
    for (const path of [
      "file:///data/user/0/app/files/media/../secrets.db",
      "file:///data/user/0/app/files/media/full/../../databases/app.db",
      "file:///data/user/0/app/files/media/%2e%2e/databases/app.db",
      "file:///data/user/0/app/files/media-other/full/x.jpg",
      "file:///data/user/0/app/files/media",
      "file:///data/user/0/app/files/other.jpg",
      "file:///etc/passwd",
    ]) {
      expect(isInsideRoot(path, root)).toBe(false);
    }
  });
});
