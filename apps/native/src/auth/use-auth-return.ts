import { addEventListener, getInitialURL } from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  captureNativeReturnLocation,
  nativeReturnLocation,
} from "@workspace/client/native-return-location";

import { appConfig } from "@/platform/app-config";

/** Protected stacks discard signed-out routes; keep the incoming destination until login and onboarding complete. */
export function useAuthReturn(signedIn: boolean, appReady: boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<ReturnType<typeof nativeReturnLocation>>(null);
  useEffect(() => {
    let active = true;
    void getInitialURL()
      .then((url) => {
        if (active)
          setPending((current) => captureNativeReturnLocation(current, url, appConfig.scheme));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    // Subscribe to events, not URL-string changes: the same link can be opened again after sign-out.
    const subscription = addEventListener("url", ({ url }) => {
      if (!signedIn)
        setPending((current) => captureNativeReturnLocation(current, url, appConfig.scheme));
    });
    return () => subscription.remove();
  }, [signedIn]);
  useEffect(() => {
    if (signedIn && appReady && pending) {
      setPending(null);
      router.replace(pending);
    }
  }, [signedIn, appReady, pending, router]);
}
