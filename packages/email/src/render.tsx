/** @jsxRuntime automatic @jsxImportSource react */
import { getT } from "@workspace/i18n";
import { render } from "@react-email/components";

import { Layout, type LayoutProps } from "./components/layout";
import type { EmailInput, RenderedEmail } from "./types";

const LINK_HOURS = 1;

type Content = {
  subject: string;
  layout: Pick<LayoutProps, "title" | "body" | "action" | "expiresInHours">;
};

function describe(input: EmailInput, t: ReturnType<typeof getT>): Content {
  const app = input.appName;
  switch (input.template) {
    case "verification":
      return {
        subject: t("emails__verification_subject", { app }),
        layout: {
          title: t("emails__verification_title"),
          body: t("emails__verification_body", { app }),
          action: { label: t("emails__verification_action"), url: input.url },
          expiresInHours: LINK_HOURS,
        },
      };
    case "reset-password":
      return {
        subject: t("emails__reset_subject", { app }),
        layout: {
          title: t("emails__reset_title"),
          body: t("emails__reset_body", { app }),
          action: { label: t("emails__reset_action"), url: input.url },
          expiresInHours: LINK_HOURS,
        },
      };
    case "change-email":
      return {
        subject: t("emails__change_subject", { app }),
        layout: {
          title: t("emails__change_title"),
          body: t("emails__change_body", { app, newEmail: input.newEmail }),
          action: { label: t("emails__change_action"), url: input.url },
          expiresInHours: LINK_HOURS,
        },
      };
    case "delete-account":
      return {
        subject: t("emails__deletion_subject", { app }),
        layout: {
          title: t("emails__deletion_title"),
          body: t("emails__deletion_body", { app }),
          action: { label: t("emails__deletion_action"), url: input.url },
          expiresInHours: LINK_HOURS,
        },
      };
    case "sign-in-notice":
      return {
        subject: t("emails__sign_in_subject", { app }),
        layout: { title: t("emails__sign_in_title"), body: t("emails__sign_in_body", { app }) },
      };
    case "security-notice":
      return {
        subject: t("emails__security_subject", { app }),
        layout: {
          title: t("emails__security_title"),
          body: `${t("emails__security_body", { app })} ${t("emails__security_warning")}`,
        },
      };
    case "existing-account":
      return {
        subject: t("emails__existing_account_subject"),
        layout: {
          title: t("emails__existing_account_title"),
          body: t("emails__existing_account_body", { app }),
          action: { label: t("emails__existing_account_action"), url: input.url },
        },
      };
  }
}

/** Renders one email in the recipient's language. */
export async function renderEmail(input: EmailInput): Promise<RenderedEmail> {
  const t = getT(input.locale);
  const { subject, layout } = describe(input, t);
  const element = (
    <Layout
      t={t}
      locale={input.locale}
      appName={input.appName}
      to={input.to}
      request={input.request}
      {...layout}
    />
  );
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { to: input.to, subject: subject, html, text };
}
