# 0022. Local encryption: SQLCipher on native, none on web yet

Status: accepted (2026-11-07). Covers D15 (amended).

## Context

The local database holds health data. A browser has no safe key store. Only acknowledged replicated rows are disposable: pending writes, rejected payloads and local-only state are the only copy and must survive any encryption migration, key loss or open failure. Encryption at rest does not protect against a running app or XSS.

## Decision

- Native uses SQLCipher through op-sqlite from day one, with the key in SecureStore.
- The optional web `encryptionKey` hook is dropped. Web encryption returns only with a designed, supported VFS and key lifecycle.
- Key (settled 2026-11-07): a random 256-bit key is created on first open and stored in SecureStore with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. The database file is excluded from OS backups. A missing or wrong key moves the file aside (never deletes it), starts a fresh database and resyncs, and tells the user that unsent changes may be lost. No server key escrow.
- No automatic wipe on open errors. Destructive resync is unsafe while unsent or rejected work exists; offer explicit recovery or export where possible.
- Native key creation, open failure, reinstall and backup/restore policy is written before real health data. Database and key backup exclusions must be coherent.
- The native runtime version changes when the native stack changes (op-sqlite, SQLCipher), so incompatible OTA JavaScript is never delivered to an old binary. `runtimeVersion: appVersion` does not do this by itself.
- Pick an op-sqlite 18.x release compatible with `@powersync/react-native` (peer `>=17.1.0 <19.0.0`); latest 19.x is out of range.

## Consequences

- Settled in phase 5: `@op-engineering/op-sqlite` 18.2.5 (exact pin), with `@powersync/react-native` 2.4.0. Evidence: 2.4.0 declares the peer `>=17.1.0 <19.0.0`; 18.2.5 is the newest 18.x on the registry (2026-09-20); 19.x is out of range. Installed with Expo SDK 58 / RN 0.88.1 without peer warnings, `expo install --check` and `expo-doctor` pass; the device build is still unproven.
- SQLCipher is enabled by `"op-sqlite": { "sqlcipher": true }` in `apps/native/package.json` (Android reads the app package.json). The podspec reads the nearest `package.json` above the package's real path, which under pnpm may be the repo root, so the same flag is set in the root `package.json`. Both must stay in sync.
- No `allowBuilds` entry is needed: none of the new packages has an install script.
- Runtime version: `apps/native/app.config.ts` uses `${appConfig.version}+native.${NATIVE_STACK_REVISION}`. Bump `NATIVE_STACK_REVISION` whenever a native module or its build flags change. Phase 5 set it to 1. A fingerprint policy remains an option for phase 7.
- Key handling lives in `apps/native/src/platform/local-database/` (pure decisions in `key-lifecycle.ts`). The database sits in its own directory: on iOS `Library/<app>-local` marked `isExcludedFromBackup` by the local module `modules/vermillion-backup`; on Android the `databases/<app>-local` directory is excluded by `plugins/with-local-database-backup-rules.js`, which also replaces the SecureStore backup rules (the SecureStore plugin runs with `configureAndroidBackup: false`).
- Device checklist (dev-client or release build, both platforms; none of it can be run in CI):
  1. Cold start with SQLCipher: first launch creates the key and database; `file local.db` (via adb run-as or the iOS container) shows no SQLite header; kill and relaunch reads the data back.
  2. Missing key: delete the SecureStore entry (or clear the keychain item) with the file present. Expect a `local.db.reset-<timestamp>` file, a fresh database, the "Local data was reset" toast, and a resync.
  3. Wrong key: overwrite the stored key. Same expectations as 2 with reason `wrong-key`.
  4. Locked keychain: launch in the background right after reboot (before first unlock). Expect an error, not a reset.
  5. Backup exclusion: iOS, inspect an encrypted device backup for the `-local` directory; Android, `adb shell bmgr backupnow` / `adb shell dumpsys backup` and a transport restore, confirm the database and the key are absent after restore.
  6. Reinstall: iOS keeps the Keychain entry but the file is gone (fresh database, same key); Android loses both. No reset toast either way.
  7. Runtime version: `npx expo config` shows `1.0.0+native.1`; an update published for another runtime is not delivered to this binary.
  8. Metro and `uniwind` still bundle (`withUniwindConfig` outermost) and `crypto.randomUUID` works before PowerSync is imported.
- SQLCipher must be verified on a real release binary: cold start, missing or wrong key, backup restore, runtime mismatch. Phase 5 pauses for a dev-client rebuild.
