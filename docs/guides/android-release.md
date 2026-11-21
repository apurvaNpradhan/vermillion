# Android release APK

`.github/workflows/android-release.yml` builds a signed release APK on a GitHub-hosted runner and attaches it, with its SHA-256, to a GitHub Release. It needs no EAS account or build quota. Play Store builds (an AAB through EAS Submit) are a separate path ([deployment](../deployment.md#native)).

## How it works

1. `android/` is not committed. The job runs `expo prebuild --platform android`, which generates it from `apps/native/app.config.ts`.
2. The `with-release-signing` config plugin (`apps/native/plugins/`) adds a `release` signing config to `app/build.gradle`. It reads the keystore from `VERMILLION_UPLOAD_STORE_FILE`, `_STORE_PASSWORD`, `_KEY_ALIAS` and `_KEY_PASSWORD`. Without a store file (a local `expo run:android --variant release`) it keeps the debug key; with a store file and a missing value the build stops.
3. Gradle runs `assembleRelease` for `arm64-v8a`, which covers nearly every current phone. A manual run can choose `universal` (all four ABIs, about 15 minutes more).
4. The job checks with `apksigner` that the APK is signed by the keystore's certificate, and prints that certificate's SHA-256 fingerprint in the job summary.
5. On a tag, a second job (the only one with a write token) creates the release and uploads `basalt-<tag>-<abis>.apk` and its `.sha256`.

`EXPO_PUBLIC_SERVER_URL` is baked into the JavaScript bundle at build time. The version name is `version` in the root `app.config.ts`; the version code is the workflow's run number, so each build installs over the previous one.

## One-time setup

1. **Deploy the API and PowerSync** ([deployment](../deployment.md)). Without a reachable server, sign-in fails.
2. **Create the release keystore.** Keep a copy and its passwords outside the repo, for example in a password manager. If it is lost, installed apps cannot be updated, only reinstalled, and every passkey origin changes.

   ```sh
   keytool -genkeypair -v -storetype PKCS12 -keystore vermillion-release.keystore \
     -alias vermillion -keyalg RSA -keysize 2048 -validity 10000
   ```

3. **Add the secrets and the variable** (repository Settings → Secrets and variables → Actions):

   ```sh
   base64 -w0 vermillion-release.keystore | gh secret set ANDROID_UPLOAD_KEYSTORE_BASE64
   gh secret set ANDROID_UPLOAD_STORE_PASSWORD   # prompts
   gh secret set ANDROID_UPLOAD_KEY_ALIAS --body vermillion
   gh secret set ANDROID_UPLOAD_KEY_PASSWORD     # prompts; the store password for PKCS12
   gh variable set EXPO_PUBLIC_SERVER_URL --body https://basalt-api.<domain>
   # optional: gh variable set EXPO_PUBLIC_TURNSTILE_SITE_KEY --body <site key>
   ```

4. **Keep the certificate's fingerprint.** Nothing uses it today (passkeys and verified app links are withdrawn until the final domain, ADR 0046), but they will need it then. Read it now, or copy it from the first run's job summary:

   ```sh
   keytool -list -v -keystore vermillion-release.keystore -alias vermillion | grep SHA256
   ```

   Several certificates are comma-separated (this keystore, the EAS keystore, the Play app signing key).

5. **Fill the Gradle cache once**: Actions → Android release → Run workflow on `main`. Only runs on the default branch write the Gradle cache; tag builds read it.

## Releasing

Bump `version` in `app.config.ts`, merge, then tag that commit and push the tag. The tag must be `v` plus the version, or the job stops:

```sh
git tag v1.0.0 && git push origin v1.0.0
```

A manual run (Actions → Android release → Run workflow) builds the same APK as a workflow artifact (`android-apk`, kept 14 days) without creating a release. Re-running a tag's workflow replaces the release's files.

To check a download: `sha256sum -c basalt-v1.0.0-arm64-v8a.apk.sha256`.

## When it fails

| Message                                             | Cause                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_SERVER_URL` / `Missing secret`         | A variable or secret from step 3 is not set.                                                   |
| `Could not read the certificate`                    | Wrong store password or alias, or the base64 value is not the keystore.                        |
| `app/build.gradle no longer has the expected shape` | An Expo upgrade changed the template; update the plugin's two patterns and its test.           |
| `The APK is not signed with the release keystore`   | The signing config was not applied. Check the plugin is listed in `apps/native/app.config.ts`. |
