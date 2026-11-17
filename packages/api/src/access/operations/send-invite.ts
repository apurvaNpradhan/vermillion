import { DEFAULT_LOCALE } from "@workspace/shared";

import { queueEmail } from "../../auth/index";
import type { Services } from "../../platform/services";

/**
 * Queues the invite email: the download link, and the site link that carries the token so the
 * address is prefilled there. Goes through the same outbox and job as the auth emails.
 */
export async function sendInviteEmail(services: Services, to: string, token: string) {
  const site = services.config.siteUrl.replace(/\/+$/, "");
  await queueEmail(services, {
    kind: "invite",
    to,
    inviteUrl: `${site}/invite?token=${encodeURIComponent(token)}`,
    downloadUrl: `${site}/download`,
    request: { requestedAt: new Date().toISOString(), localeHint: DEFAULT_LOCALE },
  });
}
