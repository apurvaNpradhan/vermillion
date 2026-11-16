import { AttachmentState } from "@powersync/common";
import { describe, expect, it } from "vitest";

import { mediaFile } from "./media-state";

const present = (state: number | null, localUri: string | null = null) => ({
  mediaPresent: true,
  state,
  localUri,
});

describe("mediaFile", () => {
  it("is missing when the device has no media row", () => {
    expect(mediaFile({ mediaPresent: false, state: null, localUri: null }, false)).toEqual({
      uri: null,
      state: "missing",
    });
    expect(
      mediaFile({ mediaPresent: false, state: AttachmentState.SYNCED, localUri: "f" }, false),
    ).toEqual({
      uri: null,
      state: "missing",
    });
  });

  it("shows a synced file from disk", () => {
    expect(mediaFile(present(AttachmentState.SYNCED, "file:///a.jpg"), false)).toEqual({
      uri: "file:///a.jpg",
      state: "local",
    });
    // Even a stale failure does not hide a file that is here.
    expect(mediaFile(present(AttachmentState.SYNCED, "file:///a.jpg"), true).state).toBe("local");
  });

  it("shows the local file while it uploads, and failed once an attempt failed", () => {
    expect(mediaFile(present(AttachmentState.QUEUED_UPLOAD, "file:///a.jpg"), false)).toEqual({
      uri: "file:///a.jpg",
      state: "uploading",
    });
    expect(mediaFile(present(AttachmentState.QUEUED_UPLOAD, "file:///a.jpg"), true)).toEqual({
      uri: "file:///a.jpg",
      state: "failed",
    });
  });

  it("is downloading until the file arrives, with no uri, and failed after a failure", () => {
    for (const state of [null, AttachmentState.QUEUED_DOWNLOAD, AttachmentState.ARCHIVED]) {
      expect(mediaFile(present(state), false)).toEqual({ uri: null, state: "downloading" });
      expect(mediaFile(present(state), true)).toEqual({ uri: null, state: "failed" });
    }
    expect(mediaFile(present(AttachmentState.SYNCED, null), false)).toEqual({
      uri: null,
      state: "downloading",
    });
  });

  it("treats a queued delete as gone", () => {
    expect(mediaFile(present(AttachmentState.QUEUED_DELETE, "file:///a.jpg"), false)).toEqual({
      uri: null,
      state: "missing",
    });
  });
});
