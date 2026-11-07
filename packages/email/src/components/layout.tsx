/** @jsxRuntime automatic @jsxImportSource react */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

import type { TFunction } from "@workspace/i18n";

import type { RequestDetails } from "../types";

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type LayoutProps = {
  t: TFunction;
  locale: string;
  appName: string;
  to: string;
  title: string;
  /** Intro paragraph under the title. */
  body: string;
  action?: { label: string; url: string };
  /** Hours the action link stays valid, shown as a plural-aware sentence. */
  expiresInHours?: number;
  request?: RequestDetails;
  children?: ReactNode;
};

export function Layout(props: LayoutProps) {
  const { t, locale, appName, to, title, body, action, expiresInHours, request, children } = props;
  const device =
    request?.browser && request.os
      ? t("emails__browser_on", { browser: request.browser, os: request.os })
      : (request?.browser ?? request?.os);
  const rows = [
    [t("emails__request_ip"), request?.ip],
    [t("emails__request_device"), device],
    [t("emails__request_time"), request?.requestedAt?.slice(0, 19).replace("T", " ")],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <Html lang={locale} dir="ltr">
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ margin: 0, backgroundColor: "#f6f6f7", fontFamily: font, color: "#18181b" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "40px 24px" }}>
          <Text style={{ fontSize: 18, fontWeight: 600, margin: "0 0 24px" }}>{appName}</Text>
          <Section
            style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: "28px 28px 24px" }}
          >
            <Heading as="h1" style={{ fontSize: 22, margin: "0 0 12px" }}>
              {title}
            </Heading>
            <Text style={{ fontSize: 15, lineHeight: "24px", margin: "0 0 16px" }}>{body}</Text>
            {children}
            {action ? (
              <>
                <Button
                  href={action.url}
                  style={{
                    backgroundColor: "#18181b",
                    color: "#ffffff",
                    borderRadius: 8,
                    padding: "10px 18px",
                    fontSize: 15,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  {action.label}
                </Button>
                {expiresInHours ? (
                  <Text style={{ fontSize: 13, color: "#52525b", margin: "16px 0 0" }}>
                    {t("emails__link_expiry", { count: expiresInHours })}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 12, color: "#71717a", margin: "16px 0 0" }}>
                  {t("emails__fallback_link")} <Link href={action.url}>{action.url}</Link>
                </Text>
              </>
            ) : null}
            {rows.length > 0 ? (
              <>
                <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0 12px" }} />
                <Text style={{ fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>
                  {t("emails__request_details_title")}
                </Text>
                {rows.map(([label, value]) => (
                  <Text key={label} style={{ fontSize: 13, color: "#52525b", margin: 0 }}>
                    {label}: {value}
                  </Text>
                ))}
              </>
            ) : null}
          </Section>
          {action ? (
            <Text style={{ fontSize: 12, color: "#71717a", margin: "20px 0 0" }}>
              {t("emails__ignore_notice")}
            </Text>
          ) : null}
          <Text style={{ fontSize: 12, color: "#71717a", margin: "4px 0 0" }}>
            {t("emails__footer_reason", { email: to, app: appName })}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
