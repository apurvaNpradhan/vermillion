import { describe, expect, it } from "vitest";

import {
  MEDIA_LIMITS,
  fitWithin,
  mediaAttachmentId,
  mediaFileName,
  mediaInput,
  mediaObjectKey,
  mediaUserPrefix,
  parseMediaAttachmentId,
} from "./media";

const ID = "0192f3c4-7a5b-7c3e-8d1a-123456789abc";

describe("media object keys", () => {
  it("puts every object of a user under one prefix", () => {
    expect(mediaUserPrefix("u1")).toBe("users/u1/");
    expect(mediaObjectKey("u1", ID, "full")).toBe(`users/u1/${ID}.jpg`);
    expect(mediaObjectKey("u1", ID, "thumb")).toBe(`users/u1/${ID}_t.jpg`);
    expect(mediaObjectKey("u1", ID, "thumb").startsWith(mediaUserPrefix("u1"))).toBe(true);
  });

  it("names files and attachments after the same variant suffix", () => {
    expect(mediaFileName(ID, "full")).toBe(`${ID}.jpg`);
    expect(mediaFileName(ID, "thumb")).toBe(`${ID}_t.jpg`);
    expect(mediaAttachmentId(ID, "full")).toBe(ID);
    expect(mediaAttachmentId(ID, "thumb")).toBe(`${ID}_t`);
  });

  it("reads an attachment id back, and refuses one that is not ours", () => {
    expect(parseMediaAttachmentId(ID)).toEqual({ mediaId: ID, variant: "full" });
    expect(parseMediaAttachmentId(`${ID}_t`)).toEqual({ mediaId: ID, variant: "thumb" });
    expect(parseMediaAttachmentId("not-a-uuid")).toBeNull();
    expect(parseMediaAttachmentId(`${ID}_x`)).toBeNull();
  });
});

describe("mediaInput", () => {
  const valid = {
    kind: "program_cover",
    mime: "image/jpeg",
    width: 2048,
    height: 1536,
    bytes: 900_000,
    thumb_bytes: 40_000,
  };

  it("accepts a well-formed row", () => {
    expect(mediaInput.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["an unknown kind", { kind: "video" }],
    ["another type", { mime: "image/png" }],
    ["a zero dimension", { width: 0 }],
    ["a dimension beyond the full edge", { height: MEDIA_LIMITS.fullEdge + 1 }],
    ["an object over the size limit", { bytes: MEDIA_LIMITS.maxBytes + 1 }],
    ["an empty thumbnail", { thumb_bytes: 0 }],
    ["a fractional size", { bytes: 10.5 }],
  ])("refuses %s", (_name, patch) => {
    expect(mediaInput.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("refuses an unknown field", () => {
    expect(mediaInput.safeParse({ ...valid, user_id: "x" }).success).toBe(false);
  });
});

describe("fitWithin", () => {
  it("scales the long edge down and keeps the aspect ratio", () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3000, 4000, 512)).toEqual({ width: 384, height: 512 });
  });

  it("never scales up", () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(2048, 2048, 2048)).toEqual({ width: 2048, height: 2048 });
  });

  it("keeps both sides at least 1", () => {
    expect(fitWithin(100_000, 10, 512)).toEqual({ width: 512, height: 1 });
  });
});
