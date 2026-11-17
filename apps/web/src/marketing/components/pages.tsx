import { Link } from "@tanstack/react-router";

import { appConfig } from "@/platform/app-config";
import { useT, type SiteKey } from "@/platform/i18n";

import { useInviteLink } from "../use-request-access";
import { RequestAccessForm } from "./request-access-form";
import { SiteLayout } from "./site-layout";

const SCREENSHOTS: { src: string; alt: SiteKey }[] = [
  { src: "/screenshots/01-home.png", alt: "site__shot_home" },
  { src: "/screenshots/07-live-session-rest-timer.png", alt: "site__shot_session" },
  { src: "/screenshots/04-program-detail.png", alt: "site__shot_program" },
  { src: "/screenshots/08-exercise-library.png", alt: "site__shot_library" },
];

const SUPPORT_EMAIL = `support@${appConfig.domain}`;

/** One screen: the name, the pitch, screenshots and the request form. */
export function LandingPage() {
  const t = useT();
  return (
    <SiteLayout>
      <section className="flex flex-col gap-4 py-8">
        <h1 className="font-semibold text-4xl tracking-tight text-text-primary sm:text-5xl">
          {appConfig.displayName}
        </h1>
        <p className="max-w-xl text-lg text-text-secondary">{t("site__pitch")}</p>
        <p className="max-w-xl text-text-muted">{t("site__pitch_detail")}</p>
      </section>
      <ul
        className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4"
        aria-label={t("site__shots")}
      >
        {SCREENSHOTS.map((shot) => (
          <li key={shot.src} className="shrink-0 snap-start">
            <img
              src={shot.src}
              alt={t(shot.alt)}
              width={216}
              height={468}
              loading="lazy"
              className="h-auto w-44 rounded-2xl bg-surface sm:w-52"
            />
          </li>
        ))}
      </ul>
      <section className="mt-8 flex max-w-xl flex-col gap-3 rounded-2xl bg-surface p-5">
        <h2 className="font-semibold text-xl text-text-primary">{t("site__request_title")}</h2>
        <p className="text-text-secondary">{t("site__request_body")}</p>
        <RequestAccessForm />
      </section>
    </SiteLayout>
  );
}

export type LegalSection = { heading: SiteKey; paragraphs: SiteKey[] };

/** Privacy, terms and account deletion: plain text, marked as a draft for the owner to review. */
export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: SiteKey;
  intro: SiteKey;
  sections: LegalSection[];
}) {
  const t = useT();
  const values = { app: appConfig.displayName, email: SUPPORT_EMAIL, site: appConfig.urls.site };
  return (
    <SiteLayout>
      <article className="flex max-w-2xl flex-col gap-6 py-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-semibold text-3xl text-text-primary">{t(title, values)}</h1>
          <p className="rounded-lg bg-surface-control px-3 py-2 text-sm text-text-secondary">
            {t("legal__draft_note")}
          </p>
          <p className="text-text-secondary">{t(intro, values)}</p>
        </header>
        {sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="font-semibold text-lg text-text-primary">
              {t(section.heading, values)}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-text-secondary">
                {t(paragraph, values)}
              </p>
            ))}
          </section>
        ))}
      </article>
    </SiteLayout>
  );
}

export function SupportPage() {
  const t = useT();
  return (
    <SiteLayout>
      <article className="flex max-w-2xl flex-col gap-4 py-6">
        <h1 className="font-semibold text-3xl text-text-primary">{t("support__title")}</h1>
        <p className="text-text-secondary">{t("support__body", { app: appConfig.displayName })}</p>
        <a className="font-medium text-text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
        <p className="text-text-muted">{t("support__include")}</p>
      </article>
    </SiteLayout>
  );
}

/** Shown at /download only when there is no release yet (the Worker redirects otherwise). */
export function DownloadPage() {
  const t = useT();
  return (
    <SiteLayout>
      <article className="flex max-w-2xl flex-col gap-4 py-6">
        <h1 className="font-semibold text-3xl text-text-primary">{t("download__title")}</h1>
        <p className="text-text-secondary">{t("download__none")}</p>
        <Link to="/" className="font-medium text-text-primary underline">
          {t("download__back")}
        </Link>
      </article>
    </SiteLayout>
  );
}

/** Where the invite email's link lands: the address, whether it works, and the download. */
export function InvitePage({ token }: { token: string | undefined }) {
  const t = useT();
  const { invite, loading, failed } = useInviteLink(token);
  const live = invite?.state === "invited";
  return (
    <SiteLayout>
      <article className="flex max-w-2xl flex-col gap-4 py-6">
        <h1 className="font-semibold text-3xl text-text-primary">{t("invite__title")}</h1>
        {loading ? <p className="text-text-muted">{t("invite__checking")}</p> : null}
        {invite && live ? (
          <>
            <p className="text-text-secondary">
              {t("invite__live", { email: invite.email, app: appConfig.displayName })}
            </p>
            <a
              href="/download"
              className="inline-flex w-fit rounded-md bg-action px-4 py-2 font-medium text-on-action"
            >
              {t("site__nav_download")}
            </a>
          </>
        ) : null}
        {(invite && !live) || failed || !token ? (
          <p className="text-text-secondary">{t("invite__not_live")}</p>
        ) : null}
      </article>
    </SiteLayout>
  );
}

export function NotFoundPage() {
  const t = useT();
  return (
    <SiteLayout>
      <div className="flex flex-col gap-3 py-16">
        <h1 className="font-semibold text-3xl text-text-primary">{t("site__not_found")}</h1>
        <Link to="/" className="text-text-secondary underline">
          {t("download__back")}
        </Link>
      </div>
    </SiteLayout>
  );
}
