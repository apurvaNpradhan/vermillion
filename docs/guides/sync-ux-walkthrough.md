# Notes sync walkthrough (phase 6 exit)

Manual checks for the maintainer with the full stack running (`pnpm db:start`, `pnpm dev`) and synthetic data only. Do them on web in two browsers (or one normal and one private window), and once on a native dev client.

## Behaviour to know first

- Edit forms keep the field values from when editing started. Saving sends only the fields you changed. Fields you did not touch follow the note if it changes elsewhere. Same-field edits: the later upload to reach the server wins ([0019](../adr/0019-synced-table-conventions.md)).
- If a note is deleted while its form is open, the form shows "This note was deleted" with **Save as new note** (creates a new note from the text) or **Discard changes**. A deleted note is never restored.
- A rejected write stays in the local-only `rejected_writes` table with no expiry until you retry or discard it. Retry is a new local change; discard asks for confirmation ([0018](../adr/0018-upload-protocol.md)). A wipe of the device (confirmed discard-and-switch, account deletion) also clears them.

## 1. Two-device editing

1. Sign in as the same user on devices A and B; create a note "Plan" with body "one" and wait for "All changes are synced." on both.
2. Open the edit form on A and change only the title. Do not save yet.
3. On B edit only the body to "two" and save. Within seconds A's open form shows body "two" (you did not touch it) and your title text is intact.
4. Save on A. Both devices end with the new title and body "two".
5. Open the form on both and change the title to different texts. Save A, then B. The title that reached the server last wins on both devices; the body is unchanged.
6. Open the form on A, delete the note on B. A's form switches to the deleted state. Check **Save as new note** creates a fresh note and **Discard changes** closes the form.
7. Go offline on A (devtools offline), edit a note: the status line says you are offline and shows the waiting count. Go online: it drains to "All changes are synced."

## 2. Rejection recovery

Make the server refuse a write: edit a note on A while offline, delete that note on B and let B sync, then bring A online.

1. A shows "Changes the server could not accept" with a reason ("The note was deleted, so it can no longer be edited.") and no raw data or codes.
2. **Edit and retry** opens a form with your text. Submit: because the note is gone, the text is saved as a new note and a notice says so. The rejected entry disappears.
3. Repeat the setup and press **Discard**: a confirmation appears, cancelling keeps the entry, confirming removes it.
4. Reload the page and restart the native app between steps: the entry is still there until resolved.

## 3. Session expiry and sign-out

1. With unsent changes (stay offline, edit a note), choose Sign out. The dialog shows the unsent count and says the changes stay on the device. Cancel keeps you signed in; confirm signs out without wiping.
2. Sign in again as the same user: the changes upload.
3. Expire the session (revoke it in another browser or delete the session row) and trigger sync. The banner reads "Your session expired. Sign in to sync again. Everything you do stays saved on this device until then." with the waiting count; you can still read and edit notes.
4. Sign in as a different user: the "Another account" banner appears. **Discard and switch** shows the unsent count; confirming wipes and starts the new account's sync.

## 4. Lists

With more than 50 notes, only the first page loads; **Show more** loads the next page and scrolling stays smooth (web mounts only the visible rows; native uses a FlatList). A new user shows "Your notes are being downloaded…" until the first sync finishes, then "No notes yet."
