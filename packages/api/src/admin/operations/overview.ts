import { sql } from "drizzle-orm";
import { z } from "zod";

import { readSetting } from "../../platform/settings/settings";
import type { Services } from "../../platform/services";

const countsSchema = z.object({
  accounts: z.coerce.number(),
  pending_requests: z.coerce.number(),
  catalog_live: z.coerce.number(),
  catalog_retired: z.coerce.number(),
});

/** The numbers on the admin's first page (story 9). Counts read tables by name, not by import. */
export async function adminOverview(services: Services) {
  const result = await services.db.execute(sql`
    SELECT
      (SELECT count(*) FROM "user") AS accounts,
      (SELECT count(*) FROM access_invite WHERE state = 'requested') AS pending_requests,
      (SELECT count(*) FROM exercise WHERE user_id IS NULL AND retired_at IS NULL) AS catalog_live,
      (SELECT count(*) FROM exercise WHERE user_id IS NULL AND retired_at IS NOT NULL)
        AS catalog_retired`);
  const [counts] = z.object({ rows: z.array(countsSchema).length(1) }).parse(result).rows;
  if (!counts) throw new Error("Overview counts query returned no row");
  const [minimumVersion, latest] = await Promise.all([
    readSetting(services.db, "minimum_app_version"),
    services.releases.latest(),
  ]);
  return {
    accounts: counts.accounts,
    pendingRequests: counts.pending_requests,
    catalog: { live: counts.catalog_live, retired: counts.catalog_retired },
    latestRelease: latest,
    minimumVersion,
  };
}
