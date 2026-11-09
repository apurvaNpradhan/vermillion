export {
  NOTES_PAGE_SIZE,
  NOTE_BODY_MAX,
  NOTE_TITLE_MAX,
  applyLatest,
  createNote,
  deleteNote,
  draftPatch,
  editDraft,
  isDraftDirty,
  isValidNote,
  listNotesQuery,
  notes,
  notesUploadColumns,
  rejectedNoteFields,
  rejectedRetryValues,
  retryRejectedNote,
  startDraft,
  updateNote,
  watchNote,
  watchNotes,
  watchNotesCount,
} from "./notes";
export type {
  LocalNote,
  NoteDraft,
  NotePatch,
  NoteValues,
  NotesDatabase,
  NotesPage,
  RetryResult,
} from "./notes";
export {
  REJECTED_WRITES_LIMIT,
  discardRejectedWrite,
  watchRejectedWrites,
  type RejectedWrite,
  type RejectedWritesDatabase,
} from "./platform/rejected-writes";
export { createConnector, DEFAULT_RENEWAL_MARGIN_MS, SyncUploadError } from "./platform/connector";
export type { ConnectorDatabase, ConnectorSignal } from "./platform/connector";
export { classifyFailure } from "./platform/transport";
export type { FailureKind, SyncTransport } from "./platform/transport";
export { createSyncLifecycle } from "./platform/lifecycle-controller";
export type { LifecycleDatabase, SyncLifecycle } from "./platform/lifecycle-controller";
export { phaseOwner, transition } from "./platform/lifecycle-state";
export type { LifecycleEvent, Phase } from "./platform/lifecycle-state";
export { deriveIndicator } from "./platform/sync-status";
export type { LockReason, SyncIndicator, SyncSnapshot } from "./platform/sync-status";
export { claimDeviceOwner, readDeviceOwner } from "./platform/device-owner";
export { ensureInstallId, readInstallId, type InstallMetaDatabase } from "./platform/install-meta";
export { boundPayload, type BoundedPayload } from "./platform/rejected-payload";
export {
  storageRowToWire,
  wireRowToStorage,
  type StorageRow,
  type StorageValue,
  type WireRow,
  type WireValue,
} from "./platform/row-conversion";
export { drizzleSchema, powerSyncSchema } from "./platform/schema";
export {
  REJECTED_PAYLOAD_MAX_BYTES,
  deviceOwner,
  installMeta,
  rejectedWrites,
} from "./platform/tables";
export { uploadColumns } from "./platform/upload-columns";
export type {
  DatabaseFactory,
  OpenDatabaseResult,
  StorageUnavailableReason,
} from "./platform/database-factory";
