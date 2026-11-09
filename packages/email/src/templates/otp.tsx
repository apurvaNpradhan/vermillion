/** @jsxRuntime automatic @jsxImportSource react */
import type { TFunction } from "@workspace/i18n";
import { OTP_EXPIRY_SECONDS } from "@workspace/shared";

import { EmailFooter } from "../components/email-footer";
import { EmailIntro } from "../components/email-intro";
import { EmailNote } from "../components/email-note";
import { EmailShell } from "../components/email-shell";
import { Frame } from "../components/frame";
import { OtpCode } from "../components/otp-code";
import { RequestDetails } from "../components/request-details";
import type { RequestDetails as Request } from "../types";

export type OtpEmailProps = {
  t: TFunction;
  locale: string;
  appName: string;
  to: string;
  title: string;
  subtitle: string;
  otp: string;
  request?: Request | undefined;
};

/** A one-time code email: the code, how long it works, who asked, and no links. */
export function OtpEmail({ t, locale, appName, to, title, subtitle, otp, request }: OtpEmailProps) {
  const minutes = OTP_EXPIRY_SECONDS / 60;
  const expiry = t("emails__code_expiry", { count: minutes });
  return (
    <EmailShell locale={locale} appName={appName} title={title} preview={`${otp}. ${expiry}`}>
      <Frame>
        <EmailIntro title={title} subtitle={subtitle} />
        <OtpCode code={otp} hint={expiry} />
        <RequestDetails t={t} request={request} />
      </Frame>
      <EmailNote title={t("emails__code_ignore_title")}>
        {t("emails__code_ignore", { app: appName })}
      </EmailNote>
      <EmailFooter reason={t("emails__code_footer_reason", { email: to, app: appName })} />
    </EmailShell>
  );
}
