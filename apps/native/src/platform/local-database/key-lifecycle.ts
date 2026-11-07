/**
 * Key lifecycle for the encrypted local database (ADR 0022). Pure decisions over small ports, so
 * the native pieces (SecureStore, files, SQLCipher) stay at the edge and this logic is testable.
 *
 * Invariants:
 * - The key is stored before a database file can exist under it.
 * - A missing or wrong key moves the file aside; nothing is ever deleted.
 * - Errors that are not clearly "wrong key" (locked keychain, I/O) propagate and change nothing.
 */

export type LocalDataResetReason = "missing-key" | "wrong-key";

/** Typed event for the UI: the old database was set aside and a fresh one starts. */
export type LocalDataReset = {
  reason: LocalDataResetReason;
  /** Where the old file now lives, inside the same backup-excluded directory. */
  movedTo: string;
};

export type KeyStore = {
  get(): Promise<string | null>;
  set(key: string): Promise<void>;
};

export type DatabaseFiles = {
  /** True when the database file (not just a journal) exists. */
  exists(): boolean;
  /** Moves the database and its journal files aside and returns the new location. Never deletes. */
  moveAside(): string;
};

export type OpenPorts = {
  keyStore: KeyStore;
  files: DatabaseFiles;
  /**
   * Opens the existing file with `key` and reads it. Returns false only when the key is wrong;
   * any other failure throws.
   */
  keyOpensFile(key: string): Promise<boolean>;
  randomBytes(length: number): Uint8Array;
};

export type PreparedKey = { key: string; reset: LocalDataReset | null };

const KEY_BYTES = 32;

/** A random 256-bit key as 64 lowercase hex characters. */
export function generateKey(randomBytes: (length: number) => Uint8Array): string {
  const bytes = randomBytes(KEY_BYTES);
  if (bytes.length !== KEY_BYTES) throw new Error("Random source returned too few bytes");
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** SQLCipher reports a wrong key as SQLITE_NOTADB when the first page fails to decrypt. */
export function isWrongKeyError(message: string): boolean {
  return /file is not a database|file is encrypted|SQLITE_NOTADB|\(code 26\)/i.test(message);
}

/** Decides which key to open with, moving an unreadable database aside first when needed. */
export async function prepareDatabaseKey(ports: OpenPorts): Promise<PreparedKey> {
  const stored = await ports.keyStore.get();
  const fileExists = ports.files.exists();

  if (stored === null) {
    // First open, or the key was lost (keychain reset, restore without the key).
    const reset: LocalDataReset | null = fileExists
      ? { reason: "missing-key", movedTo: ports.files.moveAside() }
      : null;
    const key = generateKey(ports.randomBytes);
    await ports.keyStore.set(key);
    return { key, reset };
  }

  if (!fileExists) return { key: stored, reset: null };
  if (await ports.keyOpensFile(stored)) return { key: stored, reset: null };

  const movedTo = ports.files.moveAside();
  const key = generateKey(ports.randomBytes);
  await ports.keyStore.set(key);
  return { key, reset: { reason: "wrong-key", movedTo } };
}
