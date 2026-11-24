import { shareLinkUrl, type ShareLinkKind } from "@workspace/shared";

import { appConfig } from "@/platform/app-config";

/** The full link for a code, on the site host from the app config. */
export function linkFor(kind: ShareLinkKind, code: string): string {
  return shareLinkUrl(appConfig.urls.site, kind, code);
}
