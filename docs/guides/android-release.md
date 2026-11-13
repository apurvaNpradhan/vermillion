# Android release APK

`.github/workflows/android-release.yml` builds a signed release APK on GitHub Actions and attaches it to a GitHub Release. It runs `expo prebuild` and Gradle on the runner, so it needs no EAS account or build quota. The `with-release-signing` config plugin signs the release build with the upload keystore from the environment, and falls back to the debug key when that is absent.

## One-time setup

1. **Deploy the API and PowerSync** ([deployment](../deployment.md)). The APK talks to the URL baked in at build time; without a reachable server, sign-in fails.
2. **Create the upload keystore** and keep a backup outside the repo (losing it means installs cannot be updated, only reinstalled):

   ```sh
   keytool -genkeypair -v -keystore vermillion-upload.jks -alias vermillion \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

3. **Add the repository secrets and variable** (Settings → Secrets and variables → Actions):

   ```sh
   gh secret set ANDROID_UPLOAD_KEYSTORE_BASE64 < <(base64 -w0 vermillion-upload.jks)
   gh secret set ANDROID_UPLOAD_STORE_PASSWORD
   gh secret set ANDROID_UPLOAD_KEY_ALIAS --body vermillion
   gh secret set ANDROID_UPLOAD_KEY_PASSWORD
   gh variable set EXPO_PUBLIC_SERVER_URL --body https://api.<domain>
   # optional: gh variable set EXPO_PUBLIC_TURNSTILE_SITE_KEY --body <site key>
   ```

## Releasing

Bump `version` in `app.config.ts`, then tag and push:

```sh
git tag v1.0.0 && git push origin v1.0.0
```

The workflow publishes the release `v1.0.0` with `vermillion-v1.0.0.apk`. Running the workflow by hand (Actions → Android release → Run workflow) builds the same APK as a workflow artifact without creating a release.

The APK is built for `arm64-v8a` only, which covers nearly every current Android phone and keeps the download small. Play Store builds (an AAB through EAS Submit) are a separate path.
