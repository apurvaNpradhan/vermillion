import {
  syncErrorDataSchema,
  type SyncCredentials,
  type SyncUploadRequest,
  type SyncUploadResult,
} from "@workspace/shared";
import { z } from "zod";

/**
 * The network boundary of sync: the two oRPC procedures of ADR 0017/0018. Apps adapt their oRPC
 * client (`client.sync.credentials()`, `client.sync.upload(request)`); tests fake it. A call that
 * fails throws what the client throws; `classifyFailure` makes sense of it.
 */
export type SyncTransport = {
  credentials(): Promise<SyncCredentials>;
  upload(request: SyncUploadRequest): Promise<SyncUploadResult>;
};

/** What a failed call means for the queue (ADR 0018's closed table). */
export type FailureKind =
  /** 401: the session is gone. Keep the queue; the app asks to sign in again. */
  | "unauthorized"
  /** 409 `SYNC_WRONG_ACCOUNT`: the session is another account. Keep the queue. */
  | "wrong-account"
  /** 400 `SYNC_CLIENT_INCOMPATIBLE`: pause the queue until the app is updated. */
  | "incompatible"
  /** 429: back off and retry. */
  | "rate-limited"
  /** Anything else, including a lost connection: retry later, change nothing. */
  | "transient"
  /** A refusal that no retry fixes and no decision about the writes (replay mismatch, bad digest). */
  | "client-fault";

// Matches an `ORPCError` (code, status, data) without importing the client library.
const failureData = z.looseObject({
  code: z.string(),
  data: syncErrorDataSchema.optional(),
});

/** Classifies whatever a transport call threw. Never throws. */
export function classifyFailure(error: Error | null | undefined): FailureKind {
  const parsed = failureData.safeParse(error);
  if (!parsed.success) return "transient";
  if (parsed.data.code === "UNAUTHORIZED") return "unauthorized";
  switch (parsed.data.data?.code) {
    case "SYNC_WRONG_ACCOUNT":
      return "wrong-account";
    case "SYNC_CLIENT_INCOMPATIBLE":
      return "incompatible";
    case "SYNC_RATE_LIMITED":
      return "rate-limited";
    case "SYNC_REPLAY_MISMATCH":
    case "SYNC_INVALID_REQUEST":
      return "client-fault";
    default:
      return "transient";
  }
}
