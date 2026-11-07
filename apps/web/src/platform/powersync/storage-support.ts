import type { StorageUnavailableReason } from "@workspace/sync";

/** The browser capabilities `OPFSCoopSyncVFS` depends on, read from the real globals or a test double. */
export type StorageEnvironment = {
  isSecureContext: boolean;
  hasWorker: boolean;
  getDirectory: (() => Promise<FileSystemDirectoryHandle>) | undefined;
};

export function readStorageEnvironment(): StorageEnvironment {
  return {
    isSecureContext: globalThis.isSecureContext === true,
    hasWorker: "Worker" in globalThis,
    getDirectory:
      globalThis.navigator?.storage?.getDirectory?.bind(globalThis.navigator.storage) ?? undefined,
  };
}

/**
 * Whether durable local storage can work here. OPFS is probed for real (`getDirectory()` rejects in
 * some private modes and under blocked site data). There is no in-memory fallback: a failure is an
 * explicit state the UI shows.
 */
export async function detectStorage(
  environment: StorageEnvironment = readStorageEnvironment(),
): Promise<StorageUnavailableReason | null> {
  if (!environment.isSecureContext || !environment.hasWorker || !environment.getDirectory)
    return "unsupported";
  try {
    await environment.getDirectory();
    return null;
  } catch {
    return "denied";
  }
}

/** Ask the browser not to evict the origin's storage. Best effort: a refusal is not an error. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await globalThis.navigator?.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Whether the browser has promised to keep this origin's storage. */
export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await globalThis.navigator?.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}
