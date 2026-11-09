/** @jsxRuntime automatic @jsxImportSource react */
import { Container, Head, Html, Preview } from "@react-email/components";
import type { ReactNode } from "react";

import { themeCss } from "../theme/css";
import { colors, fontFamily, px, type } from "../theme/tokens";

/** The page: canvas background, the app name as a wordmark, content below. */
export function EmailShell({
  locale,
  appName,
  title,
  preview,
  children,
}: {
  locale: string;
  appName: string;
  title: string;
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html lang={locale} dir="ltr">
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <meta
          name="format-detection"
          content="telephone=no, date=no, address=no, email=no, url=no"
        />
        <style>{themeCss}</style>
      </Head>
      <Preview>{preview}</Preview>
      <body className="m-bg" style={body}>
        <div className="m-bg" style={page}>
          <Container style={container}>
            <p className="m-text" style={wordmark}>
              {appName}
            </p>
            {children}
          </Container>
        </div>
      </body>
    </Html>
  );
}

const page = { backgroundColor: colors.canvas };

const body = {
  margin: 0,
  padding: 0,
  backgroundColor: colors.canvas,
  color: colors.textPrimary,
  fontFamily,
};

const container = { maxWidth: "560px", margin: "0 auto", padding: "40px 16px 48px" };

const wordmark = {
  margin: "0 0 24px",
  color: colors.textPrimary,
  fontSize: px(type["title-md"].size),
  lineHeight: px(type["title-md"].lineHeight),
  fontWeight: type["title-md"].weight,
  letterSpacing: px(type["title-md"].tracking),
};
