import { expoClient } from "@better-auth/expo/client";
import { createAppAuthClient } from "@workspace/client/auth-client";
import * as SecureStore from "expo-secure-store";

import { appConfig } from "./app-config";
import { env } from "./env";

/** Shared auth client plus the Expo plugin, which keeps the session cookie in secure storage. */
export const authClient = createAppAuthClient(
  env.EXPO_PUBLIC_SERVER_URL,
  expoClient({
    scheme: appConfig.scheme,
    storagePrefix: appConfig.scheme,
    storage: SecureStore,
  }),
);
