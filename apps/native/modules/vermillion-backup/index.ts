import { requireNativeModule } from "expo";
import { Platform } from "react-native";

type BackupModule = { excludeFromBackup(path: string): void };

/**
 * Marks a directory as excluded from iCloud and iTunes backups (iOS, `isExcludedFromBackup`).
 * Android has no per-file API: its backup rules exclude the database directory instead (see
 * `plugins/with-local-database-backup-rules.js`), so this is a no-op there.
 */
export function excludeFromBackup(path: string): void {
  if (Platform.OS !== "ios") return;
  requireNativeModule<BackupModule>("VermillionBackup").excludeFromBackup(path);
}
