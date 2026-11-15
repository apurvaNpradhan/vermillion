import { describe, expect, it } from "vitest";

import { folderOf, relativePath } from "./files";

const ID = "0192f3c4-7a5b-7c3e-8d1a-123456789abc";

describe("media file paths", () => {
  it("keeps thumbnails and full images in their own folders", () => {
    expect(folderOf(`${ID}.jpg`)).toBe("full");
    expect(folderOf(`${ID}_t.jpg`)).toBe("thumb");
    expect(relativePath(`${ID}.jpg`)).toBe(`media/full/${ID}.jpg`);
    expect(relativePath(`${ID}_t.jpg`)).toBe(`media/thumb/${ID}_t.jpg`);
  });
});
