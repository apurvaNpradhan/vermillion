import { initCrashReporting } from "./client";

// Imported first in the app entry, so errors during start-up are reported. A no-op without a DSN.
initCrashReporting();
