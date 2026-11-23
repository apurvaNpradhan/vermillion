/** `AA:BB:…` with 32 hex bytes, as `keytool` prints a SHA-256 fingerprint. */
const FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * The Digital Asset Links document Android reads to verify the app may open this site's links
 * (`/.well-known/assetlinks.json`). A fingerprint that is not 32 colon-separated hex bytes is
 * left out, so a typo cannot publish a file Android rejects as a whole. Without any fingerprint
 * the document is empty and Android does not verify the app.
 */
export function buildAssetLinks(packageName: string, fingerprints: readonly string[]) {
  const valid = fingerprints.flatMap((value) => {
    const normalized = value.trim().toUpperCase();
    return FINGERPRINT.test(normalized) ? [normalized] : [];
  });
  if (valid.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: valid,
      },
    },
  ];
}
