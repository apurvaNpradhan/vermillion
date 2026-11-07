# Native development

The native app needs a **dev client**. Local sync uses `@op-engineering/op-sqlite` with SQLCipher, which Expo Go cannot load ([ADR 0022](../adr/0022-local-encryption.md)).

## Run it

```sh
pnpm db:start                    # Postgres, bootstrap, PowerSync on 127.0.0.1:8090
pnpm dev                         # API (3000), web (3001), Metro
pnpm --filter native android     # first build is slow; installs the dev client
```

Rebuild the dev client (`expo run:android` or `expo run:ios`) whenever a native module or build flag changes, including `"op-sqlite": { "sqlcipher": true }`. That flag lives in both `apps/native/package.json` and the root `package.json`; keep them equal. JS-only changes need only Metro.

## Runtime version

`apps/native/app.config.ts` sets `runtimeVersion` to `<version>+native.<NATIVE_STACK_REVISION>`. Bump `NATIVE_STACK_REVISION` whenever a native module or its build flags change, so an OTA update never reaches a binary without the native code it needs. Verify with `npx expo config`. New native build dependencies also go in `allowBuilds` in `pnpm-workspace.yaml`.

## Phone against local services

`localhost` on the phone must be this machine. Map the ports with adb:

```sh
adb reverse tcp:3000 tcp:3000   # API (app.config.ts ports.server)
adb reverse tcp:8090 tcp:8090   # PowerSync
adb reverse tcp:8081 tcp:8081   # Metro
```

Rebooting the computer clears the mappings; until they are set again credentials fail with a network error. `sync.credentials` returns the endpoint (`127.0.0.1:8090` in development, otherwise `SYNC_ENDPOINT_URL`), so no sync URL is baked into the build.

## Offline testing

Kill the app, or use airplane mode. `adb reverse --remove` does not close an open sync stream. Do not run Metro with `CI=1`: it disables file watching and the phone keeps the old bundle.

## Device checklist (ADR 0022)

Run on a dev-client or release build, both platforms. CI cannot run these.

1. Cold start: first launch creates key and database; the file has no SQLite header; relaunch reads data back.
2. Missing key (delete the SecureStore entry): `local.db.reset-<timestamp>` appears, fresh database, "Local data was reset" toast, resync.
3. Wrong key (overwrite it): same as 2, reason `wrong-key`.
4. Locked keychain (launch in the background right after reboot, before first unlock): an error, not a reset.
5. Backup exclusion: the iOS encrypted backup lacks the `-local` directory; Android `bmgr backupnow` plus restore leaves database and key absent.
6. Reinstall: iOS keeps the key but not the file; Android loses both; no reset toast.
7. Runtime version: `npx expo config` shows the expected `+native.N`; an update for another runtime is not delivered.
8. Metro and uniwind bundle (`withUniwindConfig` outermost) and `crypto.randomUUID` works before PowerSync is imported.

Status: not yet run on a release binary; needs the maintainer's devices.
