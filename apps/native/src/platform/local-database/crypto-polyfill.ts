import { getRandomValues, randomUUID } from "expo-crypto";

import { installCrypto } from "./install-crypto";

// Imported first by the root layout, before anything that creates an id or opens PowerSync.
installCrypto(globalThis, { getRandomValues, randomUUID });
