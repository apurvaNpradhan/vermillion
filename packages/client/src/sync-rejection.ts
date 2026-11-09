import type { TranslationKey } from "@workspace/i18n";

/** Translation keys for the reasons the server refuses an upload (ADR 0018). */
const REJECTION_KEYS = new Map<string, TranslationKey>([
  ["SYNC_UNKNOWN_TABLE", "sync__rejected_code_unknown_table"],
  ["SYNC_INVALID_OP", "sync__rejected_code_invalid"],
  ["SYNC_LIMIT_EXCEEDED", "sync__rejected_code_limit"],
  ["SYNC_ROW_NOT_FOUND", "sync__rejected_code_not_found"],
  ["SYNC_ROW_DELETED", "sync__rejected_code_deleted"],
  ["SYNC_ID_CONFLICT", "sync__rejected_code_id_conflict"],
  ["SYNC_CONSTRAINT_VIOLATION", "sync__rejected_code_constraint"],
  ["EXERCISE_CATALOG_READ_ONLY", "sync__rejected_code_exercise_catalog"],
  ["EXERCISE_DELETE_NOT_ALLOWED", "sync__rejected_code_exercise_delete"],
  ["EXERCISE_LIMIT_REACHED", "sync__rejected_code_exercise_limit"],
  ["EXERCISE_TYPE_LOCKED", "sync__rejected_code_exercise_type_locked"],
  ["SYNC_TRANSACTION_ROLLED_BACK", "sync__rejected_code_rolled_back"],
]);

/** The message key for a stored rejection code; an unknown (newer) code gets a generic one. */
export function rejectionMessageKey(code: string): TranslationKey {
  return REJECTION_KEYS.get(code) ?? "sync__rejected_code_unknown";
}
