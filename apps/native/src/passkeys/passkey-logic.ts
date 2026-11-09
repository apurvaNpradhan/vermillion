import type { PasskeyCreateRequest, PasskeyGetRequest } from "react-native-passkey";
import { z } from "zod";

/**
 * Pure parts of the passkey flows: what the server's WebAuthn options look like, how the
 * library's results become the JSON Better Auth verifies, and how failures map to messages.
 * Everything crossing the network or the native module is parsed here, never trusted.
 */

const Base64Url = z.string().min(1);
const Transport = z.enum(["ble", "hybrid", "internal", "nfc", "usb"]);

const Descriptor = z.object({
  id: Base64Url,
  type: z.literal("public-key"),
  transports: z.array(Transport).optional(),
});

/** `PublicKeyCredentialCreationOptionsJSON`, the fields the native module reads. */
export const RegistrationOptionsSchema = z.object({
  challenge: Base64Url,
  rp: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  user: z.object({ id: Base64Url, name: z.string(), displayName: z.string() }),
  pubKeyCredParams: z.array(z.object({ type: z.literal("public-key"), alg: z.number() })),
  timeout: z.number().optional(),
  excludeCredentials: z.array(Descriptor).optional(),
  authenticatorSelection: z
    .object({
      authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
      requireResidentKey: z.boolean().optional(),
      residentKey: z.enum(["discouraged", "preferred", "required"]).optional(),
      userVerification: z.enum(["discouraged", "preferred", "required"]).optional(),
    })
    .optional(),
  attestation: z.enum(["none", "indirect", "direct", "enterprise"]).optional(),
});
export type RegistrationOptions = z.infer<typeof RegistrationOptionsSchema>;

/** `PublicKeyCredentialRequestOptionsJSON`. */
export const AuthenticationOptionsSchema = z.object({
  challenge: Base64Url,
  rpId: z.string().min(1),
  timeout: z.number().optional(),
  allowCredentials: z.array(Descriptor).optional(),
  userVerification: z.enum(["discouraged", "preferred", "required"]).optional(),
});
export type AuthenticationOptions = z.infer<typeof AuthenticationOptionsSchema>;

const Attachment = z.enum(["platform", "cross-platform"]).optional().catch(undefined);

/** What `Passkey.create` resolves with. */
export const CreatedCredentialSchema = z.object({
  id: Base64Url,
  rawId: Base64Url,
  authenticatorAttachment: Attachment,
  response: z.object({
    clientDataJSON: Base64Url,
    attestationObject: Base64Url,
    authenticatorData: z.string().optional(),
    publicKeyAlgorithm: z.number().optional(),
    publicKey: z.string().optional(),
    transports: z.array(Transport).optional(),
  }),
});

/** What `Passkey.get` resolves with. */
export const AssertedCredentialSchema = z.object({
  id: Base64Url,
  rawId: Base64Url.optional(),
  authenticatorAttachment: Attachment,
  response: z.object({
    authenticatorData: Base64Url,
    clientDataJSON: Base64Url,
    signature: Base64Url,
    userHandle: z.string().optional(),
  }),
});

/** The body of `POST /passkey/verify-registration` (`RegistrationResponseJSON`). */
export function toRegistrationResponse(raw: z.infer<typeof CreatedCredentialSchema>) {
  return {
    id: raw.id,
    rawId: raw.rawId,
    type: "public-key" as const,
    clientExtensionResults: {},
    ...(raw.authenticatorAttachment
      ? { authenticatorAttachment: raw.authenticatorAttachment }
      : {}),
    response: raw.response,
  };
}

/** The body of `POST /passkey/verify-authentication` (`AuthenticationResponseJSON`). */
export function toAuthenticationResponse(raw: z.infer<typeof AssertedCredentialSchema>) {
  return {
    id: raw.id,
    rawId: raw.rawId ?? raw.id,
    type: "public-key" as const,
    clientExtensionResults: {},
    ...(raw.authenticatorAttachment
      ? { authenticatorAttachment: raw.authenticatorAttachment }
      : {}),
    response: raw.response,
  };
}

/**
 * One row of `GET /passkey/list-user-passkeys`. The Better Auth client revives ISO date strings
 * into `Date`, so `createdAt` arrives as either.
 */
export const PasskeyRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  createdAt: z.union([z.string(), z.date()]).nullish(),
});
export const PasskeyListSchema = z.array(PasskeyRowSchema);
export type PasskeyRow = { id: string; name: string | null; createdAt: Date | null };

export function toPasskeyRows(raw: z.infer<typeof PasskeyListSchema>): PasskeyRow[] {
  // `sort` on the fresh array from `map`: Hermes has no `toSorted`.
  return raw
    .map((row) => {
      const created = row.createdAt ? new Date(row.createdAt) : null;
      return {
        id: row.id,
        name: row.name?.trim() ? row.name.trim() : null,
        createdAt: created && !Number.isNaN(created.getTime()) ? created : null,
      };
    })
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

/** The `{ error, message }` object `react-native-passkey` rejects with. */
export const NativePasskeyErrorSchema = z.object({ error: z.string() });

export type PasskeyFailure =
  | "cancelled"
  | "unsupported"
  | "none-found"
  | "exists"
  | "misconfigured"
  | "failed";

/** A cancelled sheet is silent; the rest become a short message. */
export function classifyPasskeyError(code: string | null): PasskeyFailure {
  switch (code) {
    case "UserCancelled":
    case "Interrupted":
      return "cancelled";
    case "NotSupported":
    case "NoCreateOption":
      return "unsupported";
    case "NoCredentials":
      return "none-found";
    case "CredentialAlreadyExists":
      return "exists";
    case "BadConfiguration":
      return "misconfigured";
    default:
      return "failed";
  }
}

export const PASSKEY_FAILURE_KEYS = {
  unsupported: "passkeys__error_unsupported",
  "none-found": "passkeys__error_none_found",
  exists: "passkeys__error_exists",
  misconfigured: "passkeys__error_misconfigured",
  failed: "passkeys__error_failed",
} as const satisfies Record<Exclude<PasskeyFailure, "cancelled">, string>;

/** What a passkey ceremony ended with; screens show `messageKey` or stay quiet on `cancelled`. */
export type PasskeyOutcome =
  | { status: "done" }
  | { status: "cancelled" }
  | {
      status: "error";
      messageKey: (typeof PASSKEY_FAILURE_KEYS)[keyof typeof PASSKEY_FAILURE_KEYS];
    };

export function outcomeFor(failure: PasskeyFailure): PasskeyOutcome {
  return failure === "cancelled"
    ? { status: "cancelled" }
    : { status: "error", messageKey: PASSKEY_FAILURE_KEYS[failure] };
}

/** Whether the setup step still needs asking: supported, and no earlier answer on this device. */
export function shouldOfferPasskey(supported: boolean, answer: string | null): boolean {
  return supported && answer !== "done" && answer !== "skipped";
}

/** A rejection from the native module, already run through `NativePasskeyErrorSchema`. */
export function outcomeFromCaught(
  native: ReturnType<typeof NativePasskeyErrorSchema.safeParse>,
): PasskeyOutcome {
  return outcomeFor(classifyPasskeyError(native.success ? native.data.error : null));
}

/**
 * The library types credential ids as DOM `BufferSource` but its native side reads the base64url
 * strings WebAuthn JSON carries, so the descriptors pass through unchanged.
 */
function descriptors<T extends RegistrationOptions["excludeCredentials"]>(
  list: T,
): PasskeyCreateRequest["excludeCredentials"] {
  // SAFETY: ids are base64url strings, which the native module decodes; only the TS type differs.
  return list as PasskeyCreateRequest["excludeCredentials"];
}

export function toCreateRequest(options: RegistrationOptions): PasskeyCreateRequest {
  const { excludeCredentials, ...rest } = options;
  return {
    ...rest,
    ...(excludeCredentials ? { excludeCredentials: descriptors(excludeCredentials) } : {}),
  };
}

export function toGetRequest(options: AuthenticationOptions): PasskeyGetRequest {
  const { allowCredentials, ...rest } = options;
  return {
    ...rest,
    ...(allowCredentials ? { allowCredentials: descriptors(allowCredentials) } : {}),
  };
}
