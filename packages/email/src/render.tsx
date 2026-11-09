/** @jsxRuntime automatic @jsxImportSource react */
import { getT } from "@workspace/i18n";
import { render } from "@react-email/components";

import { MessageEmail, type MessageEmailProps } from "./templates/message";
import { OtpEmail } from "./templates/otp";
import type { EmailInput, RenderedEmail } from "./types";

const LINK_HOURS = 1;

type Content = {
  subject: string;
  /** Either a code email or a message; they share the recipient and request details. */
  kind:
    | { type: "otp"; title: string; subtitle: string; otp: string }
    | { type: "message"; title: string; body: string; action?: MessageEmailProps["action"] };
};

function describe(input: EmailInput, t: ReturnType<typeof getT>): Content {
  const app = input.appName;
  switch (input.template) {
    case "sign-in-code":
      return {
        subject: t("emails__sign_in_code_subject", { app, code: input.otp }),
        kind: {
          type: "otp",
          title: t("emails__sign_in_code_title"),
          subtitle: input.existingAccount
            ? `${t("emails__sign_in_code_body", { app })} ${t("emails__sign_in_code_existing")}`
            : t("emails__sign_in_code_body", { app }),
          otp: input.otp,
        },
      };
    case "change-email-code":
      return {
        subject: t("emails__change_code_subject", { app, code: input.otp }),
        kind: {
          type: "otp",
          title: t("emails__change_code_title"),
          subtitle: t("emails__change_code_body", { app }),
          otp: input.otp,
        },
      };
    case "delete-account":
      return {
        subject: t("emails__deletion_subject", { app }),
        kind: {
          type: "message",
          title: t("emails__deletion_title"),
          body: t("emails__deletion_body", { app }),
          action: {
            label: t("emails__deletion_action"),
            url: input.url,
            expiry: t("emails__link_expiry", { count: LINK_HOURS }),
          },
        },
      };
    case "sign-in-notice":
      return {
        subject: t("emails__sign_in_subject", { app }),
        kind: {
          type: "message",
          title: t("emails__sign_in_title"),
          body: t("emails__sign_in_body", { app }),
        },
      };
    case "security-notice":
      return {
        subject: t("emails__security_subject", { app }),
        kind: {
          type: "message",
          title: t("emails__security_title"),
          body: `${t("emails__security_body", { app })} ${t("emails__security_warning")}`,
        },
      };
  }
}

/** Renders one email in the recipient's language. */
export async function renderEmail(input: EmailInput): Promise<RenderedEmail> {
  const t = getT(input.locale);
  const { subject, kind } = describe(input, t);
  const common = {
    t,
    locale: input.locale,
    appName: input.appName,
    to: input.to,
    request: input.request,
  };
  const element =
    kind.type === "otp" ? (
      <OtpEmail {...common} title={kind.title} subtitle={kind.subtitle} otp={kind.otp} />
    ) : (
      <MessageEmail
        {...common}
        title={kind.title}
        body={kind.body}
        {...(kind.action ? { action: kind.action } : {})}
      />
    );
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { to: input.to, subject, html, text };
}
