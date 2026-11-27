import * as WebBrowser from "expo-web-browser";
import { AppState, Linking, Platform } from "react-native";

import { openAndroidAuthSession } from "./android-auth-session";
import { matchesCallback } from "./auth-callback";

export async function openNativeAuthBrowser(
  url: string,
  returnUrl: string,
  options: WebBrowser.AuthSessionOpenOptions | undefined,
  signal: AbortSignal,
  allowRetry: () => void,
): Promise<WebBrowser.WebBrowserAuthSessionResult> {
  if (signal.aborted) return { type: WebBrowser.WebBrowserResultType.CANCEL };
  const expected = new URL(returnUrl);
  if (Platform.OS === "android") {
    const result = await openAndroidAuthSession(
      {
        onAppActiveChange(listener) {
          const subscription = AppState.addEventListener("change", (state) =>
            listener(state === "active"),
          );
          return () => subscription.remove();
        },
        onLink(listener) {
          const subscription = Linking.addEventListener("url", (event) => listener(event.url));
          return () => subscription.remove();
        },
        open: async () =>
          (await WebBrowser.openBrowserAsync(url, options)).type ===
          WebBrowser.WebBrowserResultType.OPENED,
      },
      (callback) => matchesCallback(callback, expected),
      signal,
      allowRetry,
    );
    return result.type === "success" ? result : { type: WebBrowser.WebBrowserResultType.CANCEL };
  }

  // The native iOS session decides when it ends. Only cancel it when its owner unmounts.
  const dismiss = () => WebBrowser.dismissAuthSession();
  signal.addEventListener("abort", dismiss);
  try {
    const result = await WebBrowser.openAuthSessionAsync(url, returnUrl, options);
    if (result.type === "success" && !matchesCallback(result.url, expected)) {
      return { type: WebBrowser.WebBrowserResultType.CANCEL };
    }
    return result;
  } finally {
    signal.removeEventListener("abort", dismiss);
  }
}
