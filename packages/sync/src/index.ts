export {
  NOTES_PAGE_SIZE,
  createNote,
  deleteNote,
  notes,
  notesUploadColumns,
  updateNote,
  watchNotes,
} from "./notes";
export type { LocalNote, NotePatch, NotesDatabase, NotesPage } from "./notes";
export { createConnector, DEFAULT_RENEWAL_MARGIN_MS, SyncUploadError } from "./platform/connector";
export type { ConnectorDatabase, ConnectorSignal } from "./platform/connector";
export { classifyFailure } from "./platform/transport";
export type { FailureKind, SyncTransport } from "./platform/transport";
export { createSyncLifecycle } from "./platform/lifecycle-controller";
export type { LifecycleDatabase, SyncLifecycle, TabChannel } from "./platform/lifecycle-controller";
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
