import type { RouterClient } from "@orpc/server";

import { accessRouter, adminAccessRouter } from "../../access/index";
import { accountRouter } from "../../account/index";
import { adminRouter } from "../../admin/index";
import { adminCatalogRouter } from "../../exercise/index";
import { adminReleasesRouter, releaseRouter } from "../../release/index";
import { authRouter } from "../../auth/index";
import { mediaRouter } from "../../media/index";
import { preferencesRouter } from "../../preferences/index";
import { syncRouter } from "../sync/procedures";

/** The app router. A vertical adds its router here. */
export const appRouter = {
  access: accessRouter,
  account: accountRouter,
  /** Every procedure here is the owner's; the authorization test enumerates this namespace. */
  admin: {
    ...adminRouter,
    catalog: adminCatalogRouter,
    access: adminAccessRouter,
    releases: adminReleasesRouter,
  },
  auth: authRouter,
  media: mediaRouter,
  preferences: preferencesRouter,
  release: releaseRouter,
  sync: syncRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<AppRouter>;
