import { Passkey } from "react-native-passkey";

import { deviceStorage } from "@/platform/storage";

import { shouldOfferPasskey } from "./passkey-logic";

/** The answer is remembered per account: a new account on a used phone still gets the offer. */
const keyFor = (userId: string) => `passkeys.setup.${userId}`;

/** Whether this device can make and use passkeys (Android 9+ with a provider, iOS 15+). */
export function passkeysSupported(): boolean {
  try {
    return Passkey.isSupported();
  } catch {
    return false;
  }
}

/** Whether onboarding should still offer this account a passkey on this device. */
export function shouldOfferPasskeySetup(userId: string): boolean {
  return shouldOfferPasskey(passkeysSupported(), deviceStorage.get(keyFor(userId)));
}

/** Remember the answer so the offer is not repeated; Settings stays available. */
export function rememberPasskeySetup(userId: string, answer: "done" | "skipped") {
  deviceStorage.set(keyFor(userId), answer);
}
