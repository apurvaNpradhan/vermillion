/** @jsxRuntime automatic @jsxImportSource react */
import type { TFunction } from "@workspace/i18n";

import { EmailButton } from "../components/email-button";
import { EmailFooter } from "../components/email-footer";
import { EmailIntro } from "../components/email-intro";
import { EmailNote } from "../components/email-note";
import { EmailShell } from "../components/email-shell";
import { FallbackLink } from "../components/fallback-link";
import { Frame } from "../components/frame";

export type InviteEmailProps = {
  t: TFunction;
  locale: string;
  appName: string;
  to: string;
  downloadUrl: string;
  inviteUrl: string;
  inviteDays: number;
};

/**
 * The closed-beta invite: the address may now sign up, a button to download the app, and the
 * site link that shows the invite. Nothing to type: the address itself is the invite.
 */
export function InviteEmail(props: InviteEmailProps) {
  const { t, locale, appName, to, downloadUrl, inviteUrl, inviteDays } = props;
  const title = t("emails__invite_title", { app: appName });
  return (
    <EmailShell locale={locale} appName={appName} title={title} preview={title}>
      <Frame>
        <EmailIntro
          title={title}
          subtitle={t("emails__invite_body", { app: appName, email: to })}
        />
        <EmailButton href={downloadUrl}>{t("emails__invite_download")}</EmailButton>
        <EmailNote>{t("emails__invite_expiry", { count: inviteDays })}</EmailNote>
        <FallbackLink label={t("emails__fallback_link")} href={downloadUrl} />
        <FallbackLink label={t("emails__invite_details")} href={inviteUrl} />
      </Frame>
      <EmailNote>{t("emails__invite_ignore")}</EmailNote>
      <EmailFooter reason={t("emails__invite_footer_reason", { email: to, app: appName })} />
    </EmailShell>
  );
}
