# 0058. Share links: snapshots, codes and App Links

Status: accepted, 2026-11-23. Builds on [0042](0042-share-cards.md), [0053](0053-public-website-on-workers.md)
and [0007](0007-additive-migrations.md). Spec: `docs/design/redesign-2026-11/SPEC.md`, "P3 — Share links".
Terms: Share link, Snapshot, Code in [CONTEXT.md](../../CONTEXT.md).

## Context

A Share card (0042) is a picture. Nobody can open a picture in their own app, so a friend who sees a
program has to retype it. 0042 reserved a footer slot for a public link. The site now exists (0053)
and the API already serves signed-in and public calls, so a link can carry the plan itself.

## Decision

### What a link holds

- A **Share link** points at a **Snapshot**: an immutable copy of a **Program** (with its Workouts
  and Rotation) or a **Workout**, taken when the link is made. Later edits to the original do not
  change it. A finished **Session** shares as a Workout **template**: each completed non-warm-up set
  becomes a Planned set (its reps, weight and RPE become targets). Notes, photos, times and ids stay
  out, and a Session link never imports as logged history.
- Snapshots are JSON in a **versioned format**, `sigil.program/v1` and `sigil.workout/v1`
  (`packages/shared/src/share`). A change an older reader could misread gets a new format name, never a
  quiet edit; readers refuse a format they do not know. The schema is strict, so unknown keys fail.
- The format is **self-contained**: no user id, row id or media. An exercise carries its catalog id
  when it is a catalog exercise and always its name, equipment, type and muscles. The importer maps
  a catalog id this device knows to its own row; anything else (every Custom exercise, a catalog id
  an older catalog lacks) becomes a Custom exercise, reusing one with the same name and equipment, so
  importing twice does not duplicate exercises. The web preview reads the same names, since a browser has
  no catalog. Supersets are renumbered per Workout; a Rotation is a list of Workout indexes with
  `null` for Rest.
- Because it holds no identity and no local state, the same document can later be a **starter
  program** in a library: a static file of the same format, imported by the same code path.
- **Weights** follow the card's "Show weights" toggle. The Share link action and menu items share
  without weights; a card with weights shows them and so does its link. Bodyweight is never in a snapshot.

### Codes

- A code is 6 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0, O, 1, I or L): 31⁶ ≈ 887
  million. It is random (`crypto.randomInt`), unique by index, and retried on collision. Typed codes
  ignore case, spaces and dashes; a pasted link on any host yields its code.
- The URL is `<urls.site>/p/<code>` for a Program and `/w/<code>` for a Workout. A Session link is a
  Workout link.

### Server

- Table `share_link` (`user_id`, `code`, `kind`, `title`, `snapshot jsonb`, `created_at`, `revoked_at`),
  additive, not synced: it is server state, not training data. Rows cascade with the account.
- `share.create` (signed in, 30 a minute, 200 live links per account), `share.list`, `share.revoke`
  (the owner's; another user's code answers `NOT_FOUND`, revoking twice is fine) and `share.get`
  (public, 120 a minute per client IP). `get` returns the snapshot and the creation time, nothing
  about the owner. Unknown code: `NOT_FOUND`. **Revoked code: `GONE` (HTTP 410)**, a new error code.
- A link never expires. Revoking is the only way to turn one off. The snapshot of a revoked link is
  kept for the owner's records and is never served again.
- Guessing is hopeless at 887 million codes and 120 reads a minute per IP, so reading needs no further
  gate; a link is a capability, like an unlisted URL, and the Shared links screen says so.

### Native

- The **Share composer** makes the link when a card is first saved or shared (or "Share link" is
  pressed), not while browsing, and reuses it until the weights toggle changes. The card footer prints
  the URL (no scheme) and the code. An "Add link" chip turns this off. If the link cannot be made
  (offline, limit) the image is still shared without it.
- **Share link** actions on a Program and a Workout make a link and open the system share sheet.
  **Enter code** (Train's create sheet, Settings → Sharing) takes a code or a pasted link. Both open
  the **import preview** at `/import/<code>`: what the plan holds, which exercises will be created,
  then "Add to my programs" or "Add to my workouts". The import is one local transaction (`importSnapshot`
  in `packages/sync`) that adds new rows and changes nothing existing, and respects the training limits.
- **Shared links** (Settings → Sharing) lists live links to share again or turn off.

### Deep links and the web

- Android **App Links**: `app.config.ts` (native) declares `https://<site host>/p/*` and `/w/*`
  intent filters with `autoVerify`. expo-router routes `app/p/[code]` and `app/w/[code]` redirect to the
  preview. The manifest change bumps the native stack revision to 30.
- The site serves `/.well-known/assetlinks.json` from the **`androidCertSha256`** list in the repo's
  `app.config.ts` (fingerprints are public). It is `[]` until one is set, and a malformed fingerprint is dropped
  rather than published, so a typo cannot make Android reject the whole file.
- `/p/$code` and `/w/$code` are server-rendered on the Worker: a server function reads
  `share.get` from the API (the browser never calls the API, so no CORS) and renders the Program or Workout with a
  Download for Android button, the code and a hint. Missing, revoked and failed reads have their own
  copy. The pages are `noindex`. This is the first dynamic content on the site; the other pages stay prerendered.

## Consequences

- A link is only as private as its code: anyone holding it sees the plan. Weights are off by default
  for plans, and revoking is one tap.
- The API has a public procedure that reads user-created content. It returns only the snapshot, and
  the snapshot is validated on the way in and again on the way out.
- A signed-out user who opens an App Link lands on sign-in and must open the link again afterwards:
  the signed-out destination memory (`native-return-location`) only knows `sigil://` paths.
- Until the release certificate's fingerprint is in `app.config.ts` and the site is redeployed, Android
  cannot verify the app and opens links in the browser. The web preview and "Enter code" still work.
- iOS Universal Links are out of scope (Android only).
