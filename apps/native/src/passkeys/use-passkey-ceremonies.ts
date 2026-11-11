import { useQueryClient } from "@tanstack/react-query";
import { isNetworkError, isOfflineAuthFailure } from "@workspace/client/network-error";
import { refreshSession } from "@workspace/client/session";
import { useCallback } from "react";
import { Passkey } from "react-native-passkey";

import { authClient } from "@/platform/auth-client";

import {
  AssertedCredentialSchema,
  AuthenticationOptionsSchema,
  CreatedCredentialSchema,
  NativePasskeyErrorSchema,
  RegistrationOptionsSchema,
  outcomeFor,
  outcomeFromCaught,
  toAuthenticationResponse,
  toCreateRequest,
  toGetRequest,
  toRegistrationResponse,
  type PasskeyOutcome,
} from "./passkey-logic";
import { PASSKEYS_QUERY_KEY } from "./use-passkeys";

/*
 * The options and verify calls go through the auth client's `$fetch`, so the Expo plugin stores
 * the `better-auth-passkey` challenge cookie from the options response and sends it back, with
 * the session cookie, on the verify call.
 */

/** Adds a passkey to the signed-in account. */
export function useRegisterPasskey() {
  const queryClient = useQueryClient();
  const register = useCallback(async (): Promise<PasskeyOutcome> => {
    try {
      const options = await authClient.$fetch("/passkey/generate-register-options", {
        method: "GET",
      });
      const parsed = RegistrationOptionsSchema.safeParse(options.data);
      if (isOfflineAuthFailure(options.error)) return outcomeFor("offline");
      if (options.error || !parsed.success) return outcomeFor("failed");
      const created = CreatedCredentialSchema.safeParse(
        await Passkey.create(toCreateRequest(parsed.data)),
      );
      if (!created.success) return outcomeFor("failed");
      const verified = await authClient.$fetch("/passkey/verify-registration", {
        method: "POST",
        body: { response: toRegistrationResponse(created.data) },
      });
      if (isOfflineAuthFailure(verified.error)) return outcomeFor("offline");
      if (verified.error) return outcomeFor("failed");
      await queryClient.invalidateQueries({ queryKey: PASSKEYS_QUERY_KEY });
      return { status: "done" };
    } catch (caught) {
      if (caught instanceof Error && isNetworkError(caught)) return outcomeFor("offline");
      return outcomeFromCaught(NativePasskeyErrorSchema.safeParse(caught));
    }
  }, [queryClient]);
  return { register };
}

/** Signs in with a passkey the device holds; the session cookie lands in secure storage. */
export function useSignInWithPasskey() {
  const queryClient = useQueryClient();
  const signIn = useCallback(async (): Promise<PasskeyOutcome> => {
    try {
      const options = await authClient.$fetch("/passkey/generate-authenticate-options", {
        method: "GET",
      });
      const parsed = AuthenticationOptionsSchema.safeParse(options.data);
      if (isOfflineAuthFailure(options.error)) return outcomeFor("offline");
      if (options.error || !parsed.success) return outcomeFor("failed");
      const asserted = AssertedCredentialSchema.safeParse(
        await Passkey.get(toGetRequest(parsed.data)),
      );
      if (!asserted.success) return outcomeFor("failed");
      const verified = await authClient.$fetch("/passkey/verify-authentication", {
        method: "POST",
        body: { response: toAuthenticationResponse(asserted.data) },
      });
      if (isOfflineAuthFailure(verified.error)) return outcomeFor("offline");
      if (verified.error) return outcomeFor("failed");
      await refreshSession(queryClient, authClient);
      return { status: "done" };
    } catch (caught) {
      if (caught instanceof Error && isNetworkError(caught)) return outcomeFor("offline");
      return outcomeFromCaught(NativePasskeyErrorSchema.safeParse(caught));
    }
  }, [queryClient]);
  return { signIn };
}
