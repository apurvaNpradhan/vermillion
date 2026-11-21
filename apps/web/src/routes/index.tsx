import { createFileRoute } from "@tanstack/react-router";

import { en, features, obtainiumSteps, screenshots, site } from "../content/en.ts";
import { pageHead } from "../page-head.ts";

export const Route = createFileRoute("/")({
  head: () => pageHead("/", `${site.name}: ${site.tagline}`, site.description),
  component: Landing,
});

function Landing() {
  return (
    <>
      <section className="page hero">
        <img className="hero-logo" src="/patina-logo-512.png" alt="" width={160} height={160} />
        <h1>{site.name}</h1>
        <p className="tagline">{site.tagline}</p>
        <p className="lede">{site.subtitle}</p>
        <div className="actions">
          <a className="button" href={site.releasesUrl} rel="noreferrer">
            {en.releases}
          </a>
          <span className="note">{en.iosNote}</span>
        </div>
      </section>

      <section className="page" aria-labelledby="features">
        <h2 id="features">{en.features}</h2>
        <ul className="features">
          {features.map((feature) => (
            <li key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="page" aria-label={en.screenshots}>
        <ul className="shots">
          {screenshots.map((shot) => (
            <li key={shot.src}>
              <img src={shot.src} alt={shot.alt} width={540} height={1157} loading="lazy" />
            </li>
          ))}
        </ul>
      </section>

      <section className="page narrow" aria-labelledby="updates">
        <h2 id="updates">{en.updatesTitle}</h2>
        <p>{en.updatesIntro}</p>
        <ol>
          {obtainiumSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p>
          <a href={site.obtainiumUrl} rel="noreferrer">
            {en.updatesLink}
          </a>
        </p>
      </section>
    </>
  );
}
