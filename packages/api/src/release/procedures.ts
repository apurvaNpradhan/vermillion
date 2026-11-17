import { openapi } from "@orpc/openapi";
import { releaseStatusSchema, semverSchema } from "@workspace/shared";
import { z } from "zod";

import { admin } from "../admin/index";
import { base } from "../platform/orpc/base";
import { rateLimit } from "../platform/orpc/rate-limit";
import { readSetting, writeSetting } from "../platform/settings/settings";
import type { Services } from "../platform/services";

async function releaseStatus(services: Services) {
  const [minimumVersion, latest] = await Promise.all([
    readSetting(services.db, "minimum_app_version"),
    services.releases.latest(),
  ]);
  return { minimumVersion, latest };
}

/** What the app compares itself with: public, cheap and cached, so it may be asked often. */
const status = base
  .meta(
    openapi({
      tags: ["Releases"],
      method: "GET",
      path: "/releases/status",
      summary: "Minimum supported version and latest release",
      description: "The latest release is read from GitHub Releases and cached for ten minutes.",
    }),
  )
  .output(releaseStatusSchema)
  .handler(({ context }) => releaseStatus(context.services));

export const releaseRouter = { status };

const releasesApi = admin.meta(openapi({ tags: ["Admin"] }));

const get = releasesApi
  .meta(openapi({ method: "GET", path: "/admin/releases", summary: "Release settings" }))
  .output(releaseStatusSchema)
  .handler(({ context }) => releaseStatus(context.services));

const setMinimum = releasesApi
  .meta(
    openapi({
      method: "PUT",
      path: "/admin/releases/minimum",
      summary: "Set the minimum supported app version",
    }),
  )
  .use(rateLimit({ name: "admin.releases.write", windowMs: 60_000, max: 30 }))
  .input(z.object({ version: semverSchema }))
  .output(releaseStatusSchema)
  .handler(async ({ context, input }) => {
    const previous = await readSetting(context.services.db, "minimum_app_version");
    await context.audited(
      (tx) => writeSetting(tx, "minimum_app_version", input.version, context.userId),
      () => ({
        action: "release.set_minimum",
        targetType: "setting",
        targetId: "minimum_app_version",
        detail: { from: previous, to: input.version },
      }),
    );
    return releaseStatus(context.services);
  });

export const adminReleasesRouter = { get, setMinimum };
