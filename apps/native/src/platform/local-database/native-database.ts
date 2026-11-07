import { ANDROID_DATABASE_PATH, IOS_LIBRARY_PATH, open } from "@op-engineering/op-sqlite";
import { PowerSyncDatabase, type Schema } from "@powersync/react-native";
import { getRandomBytes } from "expo-crypto";
import { Directory, File } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { appConfig } from "../app-config";
import { excludeFromBackup } from "../../../modules/vermillion-backup";
import { localDataReset } from "./local-data-reset";
import {
  isWrongKeyError,
  prepareDatabaseKey,
  type DatabaseFiles,
  type OpenPorts,
} from "./key-lifecycle";

const KEY_NAME = `${appConfig.name}.local-db-key`;
const DB_FILENAME = "local.db";
const SIDECARS = ["", "-wal", "-shm"] as const;

function toFileUri(path: string): string {
  return path.startsWith("file://") ? path : `file://${path}`;
}

/** Dedicated directory so the backup exclusion (iOS attribute, Android rules) covers it whole. */
function databaseDirectory(): Directory {
  const base = Platform.OS === "ios" ? IOS_LIBRARY_PATH : ANDROID_DATABASE_PATH;
  const directory = new Directory(toFileUri(base), `${appConfig.name}-local`);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function createFiles(directory: Directory): DatabaseFiles {
  return {
    exists: () => new File(directory, DB_FILENAME).exists,
    moveAside() {
      const stamp = new Date().toISOString().replaceAll(/[^0-9]/g, "");
      let movedTo = "";
      for (const suffix of SIDECARS) {
        const source = new File(directory, `${DB_FILENAME}${suffix}`);
        if (!source.exists) continue;
        const target = new File(directory, `${DB_FILENAME}${suffix}.reset-${stamp}`);
        source.moveSync(target);
        if (suffix === "") movedTo = target.uri;
      }
      return movedTo;
    },
  };
}

function createPorts(directory: Directory): OpenPorts {
  const location = directory.uri.replace(/^file:\/\//, "").replace(/\/$/, "");
  return {
    keyStore: {
      get: () =>
        SecureStore.getItemAsync(KEY_NAME, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        }),
      set: (key) =>
        SecureStore.setItemAsync(KEY_NAME, key, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        }),
    },
    files: createFiles(directory),
    randomBytes: getRandomBytes,
    async keyOpensFile(key) {
      try {
        const probe = open({ name: DB_FILENAME, location, encryptionKey: key });
        try {
          probe.executeSync("SELECT count(*) FROM sqlite_master");
        } finally {
          probe.close();
        }
        return true;
      } catch (error) {
        if (error instanceof Error && isWrongKeyError(error.message)) return false;
        throw error;
      }
    },
  };
}

/**
 * Opens the SQLCipher-encrypted PowerSync database (ADR 0022). Creates the key on first open;
 * a missing or wrong key moves the old file aside, starts a fresh database and reports a
 * `LocalDataReset` through `localDataReset` for the UI. Call once per app start, after the crypto
 * polyfill; the schema comes from the sync package.
 */
export async function openNativeDatabase(schema: Schema): Promise<PowerSyncDatabase> {
  const directory = databaseDirectory();
  excludeFromBackup(directory.uri.replace(/^file:\/\//, ""));
  const ports = createPorts(directory);
  const { key, reset } = await prepareDatabaseKey(ports);
  if (reset) localDataReset.report(reset);
  return new PowerSyncDatabase({
    schema,
    database: {
      dbFilename: DB_FILENAME,
      dbLocation: directory.uri.replace(/^file:\/\//, "").replace(/\/$/, ""),
      sqliteOptions: { encryptionKey: key },
    },
  });
}
