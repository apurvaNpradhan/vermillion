/** @jsxRuntime automatic @jsxImportSource react */
import type { TFunction } from "@workspace/i18n";

import { EmailButton } from "../components/email-button";
import { EmailFooter } from "../components/email-footer";
import { EmailIntro } from "../components/email-intro";
import { EmailNote } from "../components/email-note";
import { EmailShell } from "../components/email-shell";
import { FallbackLink } from "../components/fallback-link";
import { Frame } from "../components/frame";
import { RequestDetails } from "../components/request-details";
import type { RequestDetails as Request } from "../types";

export type MessageEmailProps = {
  t: TFunction;
  locale: string;
  appName: string;
  to: string;
  title: string;
  body: string;
  /** A button with its URL repeated as a plain link. */
  action?: { label: string; url: string; expiry: string };
  request?: Request | undefined;
};

/** A notice or a one-link email (account deletion): text, optionally one primary button. */
export function MessageEmail(props: MessageEmailProps) {
  const { t, locale, appName, to, title, body, action, request } = props;
  return (
    <EmailShell locale={locale} appName={appName} title={title} preview={title}>
      <Frame>
        <EmailIntro title={title} subtitle={body} />
        {action ? (
          <>
            <EmailButton href={action.url}>{action.label}</EmailButton>
            <EmailNote>{action.expiry}</EmailNote>
            <FallbackLink label={t("emails__fallback_link")} href={action.url} />
          </>
        ) : null}
        <RequestDetails t={t} request={request} />
      </Frame>
      {action ? <EmailNote>{t("emails__ignore_notice")}</EmailNote> : null}
      <EmailFooter reason={t("emails__footer_reason", { email: to, app: appName })} />
    </EmailShell>
  );
}
