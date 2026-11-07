import { describe, expect, it } from "vitest";

import { detectStorage } from "./storage-support";

const working = {
  isSecureContext: true,
  hasWorker: true,
  getDirectory: async () => ({}) as FileSystemDirectoryHandle,
};

describe("detectStorage", () => {
  it("is available when OPFS answers", async () => {
    expect(await detectStorage(working)).toBeNull();
  });

  it("reports unsupported without a secure context, workers or OPFS", async () => {
    expect(await detectStorage({ ...working, isSecureContext: false })).toBe("unsupported");
    expect(await detectStorage({ ...working, hasWorker: false })).toBe("unsupported");
    expect(await detectStorage({ ...working, getDirectory: undefined })).toBe("unsupported");
  });

  it("reports denied when the browser refuses the directory (private mode, blocked data)", async () => {
    const refusing = async () => {
      throw new DOMException("denied", "SecurityError");
    };
    expect(await detectStorage({ ...working, getDirectory: refusing })).toBe("denied");
  });
});
