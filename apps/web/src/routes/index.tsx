import { createFileRoute } from "@tanstack/react-router";

import { features, obtainiumSteps, screenshots, site } from "../content/site.ts";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  return (
    <>
      <section className="page hero">
        <img
          className="hero-logo"
          src="/patina-logo-512.png"
          alt={`${site.name} tortoise logo`}
          width={160}
          height={160}
        />
        <h1>{site.name}</h1>
        <p className="tagline">{site.tagline}</p>
        <p className="lede">{site.subtitle}</p>
        <div className="actions">
          <a className="button" href={site.releasesUrl} rel="noreferrer">
            Download for Android
          </a>
          <span className="note">iOS is not available yet.</span>
        </div>
      </section>

      <section className="page" aria-labelledby="features">
        <h2 id="features">What it does</h2>
        <ul className="features">
          {features.map((feature) => (
            <li key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="page" aria-label="Screenshots">
        <ul className="shots">
          {screenshots.map((shot) => (
            <li key={shot.src}>
              <img src={shot.src} alt={shot.alt} width={540} height={1157} loading="lazy" />
            </li>
          ))}
        </ul>
      </section>

      <section className="page narrow" aria-labelledby="updates">
        <h2 id="updates">Get updates with Obtainium</h2>
        <p>
          Obtainium installs apps straight from their GitHub releases and updates them when a new
          one appears.
        </p>
        <ol>
          {obtainiumSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p>
          <a href={site.obtainiumUrl} rel="noreferrer">
            Get Obtainium
          </a>
        </p>
      </section>
    </>
  );
}
