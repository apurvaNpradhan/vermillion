/** @jsxRuntime automatic @jsxImportSource react */
import { Column, Heading } from "@react-email/components";

import type { TFunction } from "@workspace/i18n";

import type { RequestDetails as Request } from "../types";
import { colors, px, type } from "../theme/tokens";
import { Row } from "./row";
import { Section } from "./section";

/** Where the request came from, so a stranger's attempt is easy to spot. Nothing without data. */
export function RequestDetails({ t, request }: { t: TFunction; request?: Request | undefined }) {
  const device =
    request?.browser && request.os
      ? t("emails__browser_on", { browser: request.browser, os: request.os })
      : (request?.browser ?? request?.os);
  const rows = [
    [t("emails__request_ip"), request?.ip],
    [t("emails__request_device"), device],
    [t("emails__request_time"), request?.requestedAt?.slice(0, 19).replace("T", " ")],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  if (rows.length === 0) return null;

  return (
    <Section className="m-divider" style={wrapper}>
      <Heading as="h2" className="m-text" style={title}>
        {t("emails__request_details_title")}
      </Heading>
      {rows.map(([label, value]) => (
        <Row key={label}>
          <Column className="m-muted" style={labelCell}>
            {label}
          </Column>
          <Column align="right" className="m-secondary" style={valueCell}>
            {value}
          </Column>
        </Row>
      ))}
    </Section>
  );
}

const wrapper = {
  marginTop: "24px",
  paddingTop: "16px",
  borderWidth: "1px 0 0",
  borderStyle: "solid",
  borderColor: colors.hairline,
};

const title = {
  margin: "0 0 4px",
  color: colors.textPrimary,
  fontSize: px(type.label.size),
  lineHeight: px(type.body.lineHeight),
  fontWeight: 600,
};

const cell = {
  padding: "3px 0",
  fontSize: px(type.label.size),
  lineHeight: px(type.label.lineHeight),
};
const labelCell = {
  ...cell,
  paddingRight: "16px",
  whiteSpace: "nowrap" as const,
  color: colors.textMuted,
};
const valueCell = { ...cell, color: colors.textSecondary, textAlign: "right" as const };
