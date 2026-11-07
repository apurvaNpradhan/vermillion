import { describe, expect, it } from "vitest";

import { generateKey, isWrongKeyError, prepareDatabaseKey, type OpenPorts } from "./key-lifecycle";

/** In-memory device: a keychain entry and a database file readable by one key. */
function device(initial: { key: string | null; file: { encryptedWith: string } | null }) {
  const state = {
    key: initial.key,
    file: initial.file,
    aside: [] as string[],
    keyWrites: [] as string[],
  };
  let counter = 0;
  const ports: OpenPorts = {
    keyStore: {
      get: async () => state.key,
      set: async (key) => {
        state.key = key;
        state.keyWrites.push(key);
      },
    },
    files: {
      exists: () => state.file !== null,
      moveAside() {
        const target = `local.db.reset-${++counter}`;
        state.aside.push(target);
        state.file = null;
        return target;
      },
    },
    keyOpensFile: async (key) => state.file?.encryptedWith === key,
    randomBytes: (length) => new Uint8Array(length).fill(counter + 10),
  };
  return { state, ports };
}

describe("generateKey", () => {
  it("makes 64 hex characters from 32 random bytes", () => {
    expect(generateKey((n) => new Uint8Array(n).fill(0xab))).toBe("ab".repeat(32));
  });
  it("rejects a short random source", () => {
    expect(() => generateKey(() => new Uint8Array(8))).toThrow();
  });
});

describe("isWrongKeyError", () => {
  it("recognises SQLCipher's wrong-key failure only", () => {
    expect(isWrongKeyError("file is not a database")).toBe(true);
    expect(isWrongKeyError("SQLITE_NOTADB: ...")).toBe(true);
    expect(isWrongKeyError("database is locked")).toBe(false);
    expect(isWrongKeyError("disk I/O error")).toBe(false);
  });
});

describe("prepareDatabaseKey", () => {
  it("creates and stores a key on first open, without a reset", async () => {
    const { state, ports } = device({ key: null, file: null });
    const result = await prepareDatabaseKey(ports);
    expect(result.reset).toBeNull();
    expect(result.key).toHaveLength(64);
    expect(state.key).toBe(result.key);
  });

  it("reuses a stored key when its file opens", async () => {
    const { state, ports } = device({ key: "k1", file: { encryptedWith: "k1" } });
    expect(await prepareDatabaseKey(ports)).toEqual({ key: "k1", reset: null });
    expect(state.keyWrites).toEqual([]);
    expect(state.aside).toEqual([]);
  });

  it("keeps the stored key when the file is gone (reinstall, fresh database)", async () => {
    const { state, ports } = device({ key: "k1", file: null });
    expect(await prepareDatabaseKey(ports)).toEqual({ key: "k1", reset: null });
    expect(state.aside).toEqual([]);
  });

  it("moves the file aside and starts fresh when the key is missing", async () => {
    const { state, ports } = device({ key: null, file: { encryptedWith: "old" } });
    const result = await prepareDatabaseKey(ports);
    expect(result.reset).toEqual({ reason: "missing-key", movedTo: "local.db.reset-1" });
    expect(state.aside).toEqual(["local.db.reset-1"]);
    expect(state.key).toBe(result.key);
  });

  it("moves the file aside under a new key when the stored key is wrong", async () => {
    const { state, ports } = device({ key: "bad", file: { encryptedWith: "old" } });
    const result = await prepareDatabaseKey(ports);
    expect(result.reset).toEqual({ reason: "wrong-key", movedTo: "local.db.reset-1" });
    expect(result.key).not.toBe("bad");
    expect(state.key).toBe(result.key);
  });

  it("changes nothing when the keychain cannot be read", async () => {
    const { state, ports } = device({ key: "k1", file: { encryptedWith: "k1" } });
    ports.keyStore.get = async () => {
      throw new Error("keychain not available before first unlock");
    };
    await expect(prepareDatabaseKey(ports)).rejects.toThrow("first unlock");
    expect(state.aside).toEqual([]);
    expect(state.keyWrites).toEqual([]);
  });

  it("changes nothing when the open check fails for another reason", async () => {
    const { state, ports } = device({ key: "k1", file: { encryptedWith: "k1" } });
    ports.keyOpensFile = async () => {
      throw new Error("database is locked");
    };
    await expect(prepareDatabaseKey(ports)).rejects.toThrow("locked");
    expect(state.aside).toEqual([]);
    expect(state.file).not.toBeNull();
  });

  it("stores the new key only after the old file is set aside", async () => {
    const order: string[] = [];
    const { ports } = device({ key: null, file: { encryptedWith: "old" } });
    const moveAside = ports.files.moveAside;
    const set = ports.keyStore.set;
    ports.files.moveAside = () => {
      order.push("move");
      return moveAside();
    };
    ports.keyStore.set = async (key) => {
      order.push("key");
      await set(key);
    };
    await prepareDatabaseKey(ports);
    expect(order).toEqual(["move", "key"]);
  });
});
