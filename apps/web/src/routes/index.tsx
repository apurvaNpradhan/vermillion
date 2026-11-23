import { createFileRoute } from "@tanstack/react-router";

import { Construction } from "../components/construction.tsx";
import { Enhance, Noise, TechText } from "../components/enhance.tsx";
import { Mark } from "../components/mark.tsx";
import { en, features, photo, site } from "../content/en.ts";
import { pageHead } from "../page-head.ts";

export const Route = createFileRoute("/")({
  head: () => pageHead("/", site.title, site.description),
  component: Landing,
});

/** The hero photograph's pixel space, shared by the picture and its construction drawing. */
const HERO_FRAME = { x: 330, y: 700, h: 420, viewBox: "0 0 1080 1360" };

function Landing() {
  return (
    <>
      <Enhance nearView={false} fallback={null}>
        <Noise
          opacity={0.05}
          size={1.1}
          fps={0}
          blendMode="overlay"
          dust={0}
          scratches={0}
          fixed
          zIndex={60}
        />
      </Enhance>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-figure">
          <picture className="hero-photo">
            <source
              type="image/avif"
              srcSet="/brand/atlas-640.avif 640w, /brand/atlas-1080.avif 1080w"
              sizes="(max-width: 860px) 100vw, 640px"
            />
            <img
              src="/brand/atlas-1080.webp"
              srcSet="/brand/atlas-640.webp 640w, /brand/atlas-1080.webp 1080w"
              sizes="(max-width: 860px) 100vw, 640px"
              width={1080}
              height={1360}
              alt={photo.alt}
              fetchPriority="high"
            />
          </picture>
          <Construction className="hero-lines" frame={HERO_FRAME} />
        </div>
        <div className="wrap hero-inner">
          <p className="hero-meta label">{en.heroPlatform}</p>
          <div className="hero-copy">
            <div className="hero-wordmark" aria-hidden="true">
              <Enhance
                nearView={false}
                fallback={<p className="mast">{site.name.toUpperCase()}</p>}
              >
                <TechText
                  text={site.name.toUpperCase()}
                  fontWeight={700}
                  fontSize={260}
                  reveal="letter"
                  dashLength={4}
                  dashGap={2}
                  specks={15}
                  intro="none"
                  clickKick
                  guides={false}
                  letterSpacing={-0.05}
                  reach={200}
                  softness={0.7}
                  lineStyle="dashed"
                  strokeWidth={1.5}
                  speed={1}
                  bounce={0.4}
                  selection
                  labels
                  align="center"
                  draggable
                  sweep
                />
              </Enhance>
            </div>
            <h1 id="hero-title">{en.heroTitle}</h1>
            <p className="lead">{en.heroLead}</p>
            <div className="actions">
              <a className="button" href={site.latestReleaseUrl} rel="noreferrer">
                {en.downloadRelease}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="manifesto wrap" aria-labelledby="manifesto-title">
        <p className="label">{en.manifestoLabel}</p>
        <h2 id="manifesto-title">
          {en.manifestoTitle} <em>{en.manifestoAccent}</em>
        </h2>
        <div className="poem">
          {en.manifesto.map((paragraph) => (
            <p key={paragraph} className="poem-line">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <section className="features" aria-labelledby="features-title">
        <div className="wrap">
          <h2 id="features-title">{en.featuresTitle}</h2>
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

      <section className="close" aria-labelledby="close-title">
        <Mark size={48} ember />
        <h2 id="close-title" className="close-title">
          {site.tagline}
        </h2>
        <a className="button" href={site.latestReleaseUrl} rel="noreferrer">
          {en.downloadRelease}
        </a>
      </section>
    </>
  );
}
