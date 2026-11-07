import type { RouterClient } from "@orpc/server";

import { accountRouter } from "../../account/index";
import { adminRouter } from "../../admin/index";
import { authRouter } from "../../auth/index";
import { notesRouter } from "../../notes/index";
import { preferencesRouter } from "../../preferences/index";
import { syncRouter } from "../sync/procedures";

/** The app router. A vertical adds its router here. */
export const appRouter = {
  account: accountRouter,
  admin: adminRouter,
  auth: authRouter,
  notes: notesRouter,
  preferences: preferencesRouter,
  sync: syncRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<AppRouter>;
