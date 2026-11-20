# Catalog expansion, slice E: rollout

Status: after slices C and D. Decisions: [ADR 0050](../../adr/0050-muscle-details-and-catalog-expansion.md).

## Steps

1. **Dev.** Commit the three patch files. `pnpm db:start`, start the server (gate off in development): the log shows each patch applied with counts. Check on a device: catalog count, a few new rows with media and instructions, details on backfilled rows, cable retags, Olympic lifts' primaries, Popular order. Run the full check list (lint, typecheck, knip, test, i18n:check, test:sync).
2. **Release the app** built in slice D (its version is patch 0001's `requires_app_version`).
3. **Deploy the server** with the patches. Production start logs `exercise.catalog.patch_waiting` for 0001 (and any later file that needs the new slugs); patches without new slugs apply.
4. **Raise `minimum_app_version`** to the slice D version in the admin once the build is available to testers. The release procedure applies the waiting patches; the log shows counts and any skipped `change`s.
5. **Verify** in production: skipped changes reviewed (an admin edit won), sync size on a fresh install, thumbnail prefetch completes on Wi-Fi.

## Rollback

Patches are not reversed automatically. A wrong row is fixed in the admin or by a further patch (`change` from the wrong value to the right one, or retire). Never edit an applied patch file.
