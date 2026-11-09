import { TURNSTILE_ACTION } from "@workspace/shared";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useThemeMode } from "@/platform/theme";
import { z } from "zod";

import { env } from "@/platform/env";

const CHALLENGES_ORIGIN = "https://challenges.cloudflare.com";

/** Escapes a value for embedding in an inline script. */
const literal = (value: string) => JSON.stringify(value).replace(/</g, "\\u003c");

function widgetHtml(siteKey: string, theme: "light" | "dark") {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;background:transparent;display:flex;justify-content:center}</style>
<script src="${CHALLENGES_ORIGIN}/turnstile/v0/api.js?render=explicit&onload=ready" async defer></script>
</head><body><div id="widget"></div><script>
function post(message){window.ReactNativeWebView.postMessage(JSON.stringify(message));}
function ready(){
  turnstile.render("#widget",{
    sitekey:${literal(siteKey)},
    action:${literal(TURNSTILE_ACTION)},
    theme:${literal(theme)},
    callback:function(token){post({type:"token",token:token});},
    "expired-callback":function(){post({type:"expire"});},
    "timeout-callback":function(){post({type:"expire"});},
    "error-callback":function(code){post({type:"error",code:String(code)});return true;}
  });
}
</script></body></html>`;
}

type WidgetMessage = { type: "token"; token: string } | { type: "expire" } | { type: "error" };

const widgetMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), token: z.string() }),
  z.object({ type: z.literal("expire") }),
  z.object({ type: z.literal("error") }),
]);

function parseMessage(raw: string): WidgetMessage | null {
  try {
    const parsed = widgetMessage.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Not ours: ignore.
    return null;
  }
}

/**
 * Cloudflare Turnstile inside a WebView. The HTML is loaded with the app's own
 * origin as base URL, so the widget runs on the hostname that the server's
 * verifier checks (and that the widget's hostname list must allow).
 * Remount (change `resetKey`) for a fresh challenge: tokens are single-use.
 */
export function TurnstileWidget({
  siteKey,
  resetKey,
  onToken,
}: {
  siteKey: string;
  resetKey: number;
  onToken: (token: string | null) => void;
}) {
  const resolvedTheme = useThemeMode();
  const [height, setHeight] = useState(70);
  const baseUrl = new URL(env.EXPO_PUBLIC_SERVER_URL).origin;
  const html = useMemo(() => widgetHtml(siteKey, resolvedTheme), [siteKey, resolvedTheme]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseMessage(event.nativeEvent.data);
      if (!message) return;
      if (message.type === "token") {
        onToken(message.token);
        setHeight(70);
      } else {
        onToken(null);
      }
    },
    [onToken],
  );

  return (
    <View style={{ height }} className="w-full overflow-hidden rounded-lg">
      <WebView
        key={resetKey}
        source={{ html, baseUrl }}
        originWhitelist={[CHALLENGES_ORIGIN, baseUrl]}
        onMessage={onMessage}
        // The page may only talk to Cloudflare; everything else (links, redirects) is refused.
        onShouldStartLoadWithRequest={(request) =>
          request.url === "about:blank" ||
          request.url.startsWith(CHALLENGES_ORIGIN) ||
          request.url.startsWith(baseUrl)
        }
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        setSupportMultipleWindows={false}
        style={{ backgroundColor: "transparent" }}
      />
    </View>
  );
}
