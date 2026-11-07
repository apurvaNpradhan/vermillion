import { deviceStorage } from "@/platform/storage";

const KEY = "auth.last-login-method";

/** Per-device, independent of the browser-only Better Auth cookie plugin and session cleanup. */
export function readLastLoginMethod() {
  return deviceStorage.get(KEY);
}

export function rememberLoginMethod(method: "email" | "google" | "github") {
  deviceStorage.set(KEY, method);
}
