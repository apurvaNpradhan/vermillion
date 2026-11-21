import * as Sentry from "@sentry/react-native";
import { randomUUID } from "expo-crypto";

import { env } from "../env";
import { deviceStorage } from "../storage";
import { CRASH_REPORTS_KEY, crashReportsEnabled, readAnonymousId } from "./gate";
import { scrubBreadcrumb, scrubEvent } from "./scrub";

const dsn = env.EXPO_PUBLIC_SENTRY_DSN;

/** Whether this build has a Sentry project to report to (a build without a DSN reports nothing). */
export const crashReportingConfigured = dsn !== undefined;

const anonymousId = () => readAnonymousId(deviceStorage, randomUUID);
const reportsEnabled = () => crashReportsEnabled(deviceStorage.get(CRASH_REPORTS_KEY));

/**
 * Starts the Sentry client. With reports off the native crash handler stays off and the JS gate
 * drops every error, but the client still exists so feedback the person writes can be sent.
 *
 * Release and dist are left to the SDK: it reads the native bundle id, version and build number,
 * which is exactly the release the source maps are uploaded under.
 */
function start(reports: boolean) {
  if (dsn === undefined) return;
  Sentry.init({
    dsn,
    environment: __DEV__ ? "development" : "production",
    enableNativeCrashHandling: reports,
    // No personal data: no IP, no cookies, no request bodies, no screenshots, no replay.
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    reportAccessibilityIdentifier: false,
    // Tracing and profiling are off: they would eat the free tier for no crash value.
    tracesSampleRate: 0,
    maxBreadcrumbs: 50,
    beforeSend: (event) => (reportsEnabled() ? scrubEvent(event, anonymousId()) : null),
    beforeBreadcrumb: scrubBreadcrumb,
  });
  Sentry.setUser({ id: anonymousId() });
}

/** Call once, before the app renders. A no-op without a DSN. */
export function initCrashReporting() {
  start(reportsEnabled());
}

/** Applies a changed "Send crash reports" choice: restarts the client so native handling follows. */
export async function applyCrashReportsChoice(enabled: boolean) {
  if (!crashReportingConfigured) return;
  await Sentry.close();
  start(enabled);
}

/**
 * Sends the person's feedback through Sentry's feedback API, so it carries the device and app
 * version of the client. The email goes along only when they chose to include it.
 */
export function sendFeedback(message: string, email: string | null) {
  Sentry.captureFeedback({ message, ...(email ? { email } : {}) });
}
