# Native development

The native app needs a **dev client**. Local sync uses `@op-engineering/op-sqlite` with SQLCipher, which Expo Go cannot load ([ADR 0022](../adr/0022-local-encryption.md)).

## Run it

```sh
pnpm db:start                    # Postgres, bootstrap, PowerSync on 127.0.0.1:8090, MinIO on 127.0.0.1:9000
pnpm dev                         # API (3000) and Metro
pnpm --filter native android     # first build is slow; installs the dev client
```

Typed routes (`.expo/types/router.d.ts`, git-ignored) refresh while Metro runs. After adding a route
without Metro (an agent worktree, or when `expo start` runs out of file watchers), run
`pnpm --filter native routes:types` before `pnpm typecheck`.

Rebuild the dev client (`expo run:android` or `expo run:ios`) whenever a native module or build flag changes, including `"op-sqlite": { "sqlcipher": true }`. That flag lives in both `apps/native/package.json` and the root `package.json`; keep them equal. JS-only changes need only Metro.

Sessions (ADR 0038, slice 3) added `expo-notifications` (Rest notifications and their Android channel
"Rest timer") and `expo-keep-awake`: **rebuild the dev client** (`pnpm --filter native android`) before
running a build that includes them. An old dev client has no native module for them, so the app
fails on start with a missing native module error rather than only missing the feature. The manual
checks for Sessions are in [the device checklist](../specs/sessions/device-checklist.md).

Share cards (ADR 0042, share slice 1) added `react-native-view-shot` (captures the card as an image),
`expo-media-library` (Save to Photos, add-only: iOS shows the add-photos prompt and Android asks for
no read access) and `expo-sharing` (the system share sheet), native stack revision 16: **rebuild the
dev client** before running a build that includes them.

## Android emulator in T3 Code

On Linux, install Android SDK Platform-Tools, Android Emulator and Command-line Tools (latest) in Android Studio's SDK Manager. Create a virtual device in Device Manager; `emulator -list-avds` should list it. T3 Code's live Android preview also needs `ffmpeg` with the `libx264` encoder on the machine running the emulator.

In a local T3 Code project thread, open the right panel → **Device**, complete setup and select or start the emulator. Restart T3 Code's environment server if it was already running when you installed the SDK tools. Enable **Agents can use devices** in **Settings → Devices** only if you want agents to control the emulator.

The panel streams the emulator; it doesn't install Cinnabar. Run `pnpm --filter native android` with the emulator running to install the dev client, and use the `adb reverse` commands below for local services.

## Runtime version

`apps/native/app.config.ts` sets `runtimeVersion` to `<version>+native.<NATIVE_STACK_REVISION>`. Bump `NATIVE_STACK_REVISION` whenever a native module or its build flags change, so an OTA update never reaches a binary without the native code it needs. Verify with `npx expo config`. New native build dependencies also go in `allowBuilds` in `pnpm-workspace.yaml`.

## Phone against local services

`localhost` on the phone must be this machine. Map the ports with adb:

```sh
adb reverse tcp:3000 tcp:3000   # API (app.config.ts ports.server)
adb reverse tcp:8090 tcp:8090   # PowerSync
adb reverse tcp:9000 tcp:9000   # MinIO: the presigned URLs of user media point at it
adb reverse tcp:8081 tcp:8081   # Metro
```

Rebooting the computer clears the mappings; until they are set again credentials fail with a network error. `sync.credentials` returns the endpoint (`127.0.0.1:8090` in development, otherwise `SYNC_ENDPOINT_URL`), so no sync URL is baked into the build.

## Passkeys on a device

Withdrawn until the final domain ([ADR 0046](../adr/0046-site-admin-closed-beta-and-rename.md)). The dev-tunnel setup they needed is at tag `pre-passkey-removal` in this file. `pnpm dev:tunnel` still exposes the API through a tunnel if you need a public HTTPS URL.

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

### Training keyboard checks

On a connected Android phone, focus the minimum or maximum reps in the target picker and run
`python scripts/adb/check-keyboard-visible.py`. It compares the focused field and Done button
with the actual visible IME inset; a hidden action fails the check. For an inline weight field,
use `python scripts/adb/check-keyboard-visible.py --inline`. Check both bounds, Done dismissing
the keyboard, switching from a weight field to the effort picker, and reopening after dismissal.
The check expects the ordinary docked keyboard, not a floating keyboard.

### Camera permission for progress photos

Native stack revision 14 gives `expo-image-picker` a camera permission string (progress photos can
be taken in the app), which adds the camera permission to the Android manifest and an Info.plist
usage description. No new native module: rebuild the dev client once on every machine. The system
camera is used through the picker, so there is no ghost overlay yet (needs `expo-camera`).

### Android live workout notification

Native stack revision 13 adds the local `workout-live` Expo module and
`POST_PROMOTED_NOTIFICATIONS`. Rebuild the dev client on every machine. Expo SDK 58's
compile SDK 37 and target SDK 36 support the guarded Android 16 ProgressStyle APIs.
No foreground service or additional runtime permission prompt is used.

The live notification is silent; the existing scheduled Rest notification owns sound and vibration.
Android force-stop removes notifications and blocks background work until the app is reopened.
Test killed-process actions with process death, separately from force-stop. The native countdown
continues without JS. The Rest-over text refresh uses a native timer while the process lives and an
inexact system alarm after process death, so Android may defer that text refresh in Doze.

### Android home-screen widget

Native stack revision 19 adds the local `next-workout-widget` module: a resizable (about 4x2)
"Next workout + week" widget drawn with plain `RemoteViews` (no Glance or Compose dependency, no new
package). Rebuild the dev client on every machine. The module's manifest registers the
`AppWidgetProvider` receiver and the provider XML; Android's manifest merger adds both, so no config
plugin is needed.

The app builds a localised snapshot (`training/widget/widget-snapshot.ts`: next workout, week dots,
goal, theme colours) and passes it to the module, which stores it in the no-backup directory and
redraws the widget. `WidgetHost` rewrites it when the data, theme or language changes and on
foreground. The widget never reads the database, and its text comes from the snapshot, so the only
Android string resources are the picker's label and description. Start opens
`<scheme>://widget-start?workout=<id>`, which resumes an active Session or starts the Workout
without the conflict sheet. iOS does nothing.
