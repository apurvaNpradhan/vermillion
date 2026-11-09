/**
 * Passkey (WebAuthn) relying-party helpers shared by the API and the web app: the app-association
 * documents that bind a domain to the native apps, and the Android origin of a signing key.
 */

/** A SHA-256 certificate fingerprint as printed by `keytool`: 32 colon-separated hex bytes. */
export const CERT_SHA256_PATTERN = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/** An Apple Developer team id: ten uppercase letters and digits. */
export const APPLE_TEAM_ID_PATTERN = /^[0-9A-Z]{10}$/;

const ANDROID_ORIGIN_PREFIX = "android:apk-key-hash:";

/** Splits a comma-separated environment value into trimmed, non-empty entries. */
export function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Uppercases a fingerprint so `aa:bb` and `AA:BB` compare equal. */
export function normalizeCertFingerprint(fingerprint: string): string {
  return fingerprint.trim().toUpperCase();
}

/**
 * The WebAuthn origin Android reports for an app signed with this certificate:
 * `android:apk-key-hash:` plus the base64url (unpadded) SHA-256 bytes.
 */
export function androidApkKeyHashOrigin(fingerprint: string): string {
  const normalized = normalizeCertFingerprint(fingerprint);
  if (!CERT_SHA256_PATTERN.test(normalized)) {
    throw new Error("Expected a SHA-256 fingerprint like AA:BB:...:FF (32 bytes).");
  }
  const bytes = normalized.split(":").map((byte) => Number.parseInt(byte, 16));
  return (
    ANDROID_ORIGIN_PREFIX +
    btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "")
  );
}

/** True for an `android:apk-key-hash:` origin (never a browser origin). */
export function isAndroidOrigin(origin: string): boolean {
  return origin.startsWith(ANDROID_ORIGIN_PREFIX) && origin.length > ANDROID_ORIGIN_PREFIX.length;
}

/** Digital Asset Links statement list that lets the Android app use this domain's passkeys. */
export function buildAssetLinks(input: { packageName: string; fingerprints: readonly string[] }) {
  const fingerprints = input.fingerprints.map(normalizeCertFingerprint);
  if (fingerprints.length === 0) return null;
  return [
    {
      relation: [
        "delegate_permission/common.get_login_creds",
        "delegate_permission/common.handle_all_urls",
      ],
      target: {
        namespace: "android_app",
        package_name: input.packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

/** Apple app-site association that lets the iOS app use this domain's passkeys. */
export function buildAppleSiteAssociation(input: { teamId: string | undefined; bundleId: string }) {
  if (!input.teamId) return null;
  return { webcredentials: { apps: [`${input.teamId}.${input.bundleId}`] } };
}
