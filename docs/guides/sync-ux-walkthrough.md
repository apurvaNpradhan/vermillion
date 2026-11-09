# Sync walkthrough (phase 6 exit)

Manual checks for the maintainer with the full stack running (`pnpm db:start`, `pnpm dev`) and synthetic data only. Do them on two native dev clients (or one device and one emulator). The subject is the Custom exercise, the one synced table the user writes ([0034](../adr/0034-exercise-library.md)); the earlier version of this guide used the removed `notes` example ([0035](../adr/0035-remove-notes-example.md)).

## Behaviour to know first

- The exercise form keeps the field values from when editing started. Saving sends only the fields you changed. Fields you did not touch follow the exercise if it changes elsewhere. Same-field edits: the later upload to reach the server wins ([0019](../adr/0019-synced-table-conventions.md)).
- Exercises are never deleted; you archive them and can restore them. The catalog is read-only.
- A rejected write stays in the local-only `rejected_writes` table with no expiry until you discard it. Discard asks for confirmation ([0018](../adr/0018-upload-protocol.md)). A wipe of the device (confirmed discard-and-switch, account deletion) also clears them.

## 1. Two-device editing

1. Sign in as the same user on devices A and B; create a Custom exercise "Plan press" and wait for "All changes are synced." on both.
2. Open the edit form on A and change only the title. Do not save yet.
3. On B edit only the notes to "two" and save. Within seconds A's open form shows notes "two" (you did not touch it) and your title text is intact.
4. Save on A. Both devices end with the new title and notes "two".
5. Open the form on both and change the title to different texts. Save A, then B. The title that reached the server last wins on both devices; the notes are unchanged.
6. Archive the exercise on B while A has its form open. Saving on A still applies (archiving does not block edits) and the exercise stays archived.
7. Go offline on A (airplane mode), edit an exercise: the status line says you are offline and shows the waiting count. Go online: it drains to "All changes are synced."

## 2. Rejection recovery

Make the server refuse a write: on A go offline and edit a Custom exercise; then delete that row in Postgres (`DELETE FROM exercise WHERE id = '...'`, a deliberate server-side action, since the app never deletes), let B sync, and bring A online.

1. A shows "Changes the server could not accept" on the Exercises screen with a reason ("This item no longer exists on the server.") and no raw data or codes.
2. **Discard** asks for confirmation; cancelling keeps the entry, confirming removes it.
3. Restart the app between steps: the entry is still there until resolved.

## 3. Session expiry and sign-out

1. With unsent changes (stay offline, edit an exercise), choose Sign out. The dialog shows the unsent count and says the changes stay on the device. Cancel keeps you signed in; confirm signs out without wiping.
2. Sign in again as the same user: the changes upload.
3. Expire the session (delete the session row) and trigger sync. The banner reads "Your session expired. Sign in to sync again. Everything you do stays saved on this device until then." with the waiting count; you can still read and edit exercises.
4. Sign in as a different user: the "Another account" banner appears. **Discard and switch** shows the unsent count; confirming wipes and starts the new account's sync.

## 4. Lists

The library loads 100 rows at a time and widens as you scroll. A new user sees the first-sync state until the catalog arrives, then the list; with no network and no catalog yet, the offline state.
