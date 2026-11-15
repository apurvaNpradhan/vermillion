import type { SendRequest } from "./remote-storage";

/**
 * The app's `fetch` for the bucket's presigned URLs: `expo/fetch`, which streams bodies natively
 * and takes an ArrayBuffer. No cookies or app headers: the signature in the URL is the credential.
 */
export const sendToBucket: SendRequest = async (url, init) => {
  const { fetch } = await import("expo/fetch");
  return fetch(url, { ...init, credentials: "omit" });
};
