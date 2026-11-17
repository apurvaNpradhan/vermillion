import { user } from "@workspace/db/schema/auth";
import { APP_VERSION_HEADER } from "@workspace/shared";
import { and, eq, sql } from "drizzle-orm";

import type { Services } from "./services";

/** `1.2.0+45`, `1.2.0-beta.1+7`: a version with an optional build number, nothing else. */
const APP_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,32})?(?:\+\d{1,9})?$/;

/**
 * Records the native app's version on the account, at most once a day (or at once when the
 * version changes). Off the request path; a failure is only a stale admin view.
 */
export function recordAppVersion(services: Services, userId: string, headers: Headers) {
  const version = headers.get(APP_VERSION_HEADER)?.trim();
  if (!version || !APP_VERSION.test(version)) return;
  services.background.run(
    services.db
      .update(user)
      .set({ lastSeenAppVersion: version, lastSeenAppAt: new Date() })
      .where(
        and(
          eq(user.id, userId),
          sql`(${user.lastSeenAppAt} IS NULL OR ${user.lastSeenAppAt} < now() - interval '1 day' OR ${user.lastSeenAppVersion} IS DISTINCT FROM ${version})`,
        ),
      ),
  );
}
