import { describe, expect, it } from "vitest";

import { installCrypto } from "./install-crypto";

const fill = <T extends ArrayBufferView>(array: T) => {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) % 256;
  return array;
};

describe("installCrypto", () => {
  it("adds getRandomValues and randomUUID when the runtime has no crypto (Hermes)", () => {
    const runtime: Parameters<typeof installCrypto>[0] = {};
    installCrypto(runtime, { getRandomValues: fill, randomUUID: () => "uuid" });
    expect(runtime.crypto?.randomUUID()).toBe("uuid");
    expect(runtime.crypto?.getRandomValues(new Uint8Array(4))).toEqual(
      new Uint8Array([7, 38, 69, 100]),
    );
  });

  it("leaves an existing crypto alone", () => {
    const existing = {
      getRandomValues: fill,
      randomUUID: () => "00000000-0000-0000-0000-000000000000" as const,
    };
    const runtime = { crypto: existing };
    installCrypto(runtime, {
      getRandomValues: () => {
        throw new Error("replaced");
      },
      randomUUID: () => "x",
    });
    expect(runtime.crypto).toBe(existing);
  });
});
