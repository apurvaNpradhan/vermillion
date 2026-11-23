import { createFileRoute } from "@tanstack/react-router";

import { Mark } from "../components/mark.tsx";
import { en, features, site } from "../content/en.ts";
import { pageHead } from "../page-head.ts";

export const Route = createFileRoute("/")({
  head: () => pageHead("/", site.title, site.description),
  component: Landing,
});

function Landing() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-figure">
          <div className="device">
            <img
              src="/screenshots/live-session.webp"
              width={540}
              height={1157}
              alt={en.heroScreenAlt}
              fetchPriority="high"
            />
          </div>
        </div>
        <div className="wrap hero-inner">
          <div className="hero-copy">
            <p className="label">{en.heroOverline}</p>
            <p className="mast" aria-hidden="true">
              {site.name}
            </p>
            <h1 id="hero-title">{en.heroTitle}</h1>
            <p className="lead">{en.heroLead}</p>
            <div className="actions">
              <a className="button" href={site.latestReleaseUrl} rel="noreferrer">
                {en.download}
              </a>
            </div>
            <ul className="facts">
              {en.heroFacts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="progression wrap" aria-labelledby="progression-title">
        <p className="label">{en.progressionLabel}</p>
        <h2 id="progression-title">{en.progressionTitle}</h2>
        <p className="progression-body">{en.progression}</p>
      </section>

      <section className="features" aria-labelledby="features-title">
        <div className="wrap">
          <h2 id="features-title">{en.featuresTitle}</h2>
          <p className="features-lead">{en.featuresLead}</p>
          <ul className="feature-list">
            {features.map((feature) => (
              <li key={feature.label} className="feature-story">
                <div className="feature-copy">
                  <p className="label">{feature.label}</p>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </div>
                {feature.screenshot ? (
                  <img
                    src={`/screenshots/${feature.screenshot}.webp`}
                    alt={feature.alt ?? ""}
                    width={540}
                    height={1157}
                    loading="lazy"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="install wrap" aria-labelledby="install-title">
        <h2 id="install-title">{en.installTitle}</h2>
        <p className="lead">{en.installLead}</p>
        <ol className="install-steps">
          {en.installSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="close" aria-labelledby="close-title">
        <Mark size={48} ember />
        <h2 id="close-title" className="close-title">
          {en.closeTitle}
        </h2>
        <a className="button" href={site.latestReleaseUrl} rel="noreferrer">
          {en.download}
        </a>
      </section>
    </>
  );
}
