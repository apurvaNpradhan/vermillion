import { AttachmentState, type AttachmentRecord } from "@powersync/common";
import { describe, expect, it } from "vitest";

import { createRemoteStorage, MediaTransferError, type SendRequest } from "./remote-storage";

const ID = "0192f3c4-7a5b-7c3e-8d1a-123456789abc";
const record = (id: string): AttachmentRecord => ({
  id,
  filename: `${id}.jpg`,
  state: AttachmentState.QUEUED_UPLOAD,
});

function setup(answer: { ok: boolean; status: number } = { ok: true, status: 200 }) {
  const asked: Array<{ mediaId: string; variant: string }> = [];
  const sent: Array<Parameters<SendRequest>> = [];
  const body = new Uint8Array([1, 2, 3]).buffer;
  const storage = createRemoteStorage(
    {
      uploadUrl: async (input) => {
        asked.push(input);
        return {
          url: "https://bucket.example/put?sig=1",
          headers: { "Content-Type": "image/jpeg", "Content-Length": "3" },
        };
      },
      downloadUrl: async (input) => {
        asked.push(input);
        return { url: "https://bucket.example/get?sig=2" };
      },
    },
    async (url, init) => {
      sent.push([url, init]);
      return { ...answer, arrayBuffer: async () => body };
    },
  );
  return { storage, asked, sent, body };
}

describe("remote storage", () => {
  it("signs, then puts the bytes with the signed type", async () => {
    const { storage, asked, sent, body } = setup();
    await storage.uploadFile(body, record(ID));
    await storage.uploadFile(body, record(`${ID}_t`));
    expect(asked).toEqual([
      { mediaId: ID, variant: "full" },
      { mediaId: ID, variant: "thumb" },
    ]);
    expect(sent[0]).toEqual([
      "https://bucket.example/put?sig=1",
      { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body },
    ]);
  });

  it("signs, then gets the bytes", async () => {
    const { storage, asked, sent, body } = setup();
    expect(await storage.downloadFile(record(`${ID}_t`))).toBe(body);
    expect(asked).toEqual([{ mediaId: ID, variant: "thumb" }]);
    expect(sent).toEqual([["https://bucket.example/get?sig=2", { method: "GET" }]]);
  });

  it("fails on an error status, without the URL in the message", async () => {
    const { storage, body } = setup({ ok: false, status: 403 });
    const upload = storage.uploadFile(body, record(ID));
    await expect(upload).rejects.toBeInstanceOf(MediaTransferError);
    await expect(upload).rejects.toThrow("status 403");
    await expect(upload).rejects.not.toThrow("sig=");
    await expect(storage.downloadFile(record(ID))).rejects.toMatchObject({ status: 403 });
  });

  it("refuses an attachment that is not a media file", async () => {
    const { storage, body, sent } = setup();
    await expect(storage.uploadFile(body, record("other"))).rejects.toThrow("Not a media");
    expect(sent).toEqual([]);
  });

  it("never deletes remotely", async () => {
    const { storage, sent } = setup();
    await storage.deleteFile(record(ID));
    expect(sent).toEqual([]);
  });
});
