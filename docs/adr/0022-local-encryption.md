# 0022. Local encryption: SQLCipher on native, none on web yet

Status: accepted (2026-11-07). Covers D15 (amended).

## Context

The local database holds health data. A browser has no safe key store. Only acknowledged replicated rows are disposable: pending writes, rejected payloads and local-only state are the only copy and must survive any encryption migration, key loss or open failure. Encryption at rest does not protect against a running app or XSS.

## Decision

- Native uses SQLCipher through op-sqlite from day one, with the key in SecureStore.
- The optional web `encryptionKey` hook is dropped. Web encryption returns only with a designed, supported VFS and key lifecycle.
- No automatic wipe on open errors. Destructive resync is unsafe while unsent or rejected work exists; offer explicit recovery or export where possible.
- Native key creation, open failure, reinstall and backup/restore policy is written before real health data. Database and key backup exclusions must be coherent.
- The native runtime version changes when the native stack changes (op-sqlite, SQLCipher), so incompatible OTA JavaScript is never delivered to an old binary. `runtimeVersion: appVersion` does not do this by itself.
- Pick an op-sqlite 18.x release compatible with `@powersync/react-native` (peer `>=17.1.0 <19.0.0`); latest 19.x is out of range.

## Consequences

- Open item, phase 1 exit / phase 5: native key recovery policy and the exact op-sqlite version.
- Open item, phase 5/7: runtime-version versus fingerprint policy for OTA.
- SQLCipher must be verified on a real release binary: cold start, missing or wrong key, backup restore, runtime mismatch. Phase 5 pauses for a dev-client rebuild.
