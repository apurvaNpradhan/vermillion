import { createFileRoute } from "@tanstack/react-router";

import { Construction } from "../components/construction.tsx";
import { CircularText, Enhance, Noise, SplitText, SpotlightCard } from "../components/enhance.tsx";
import { Mark } from "../components/mark.tsx";
import { en, features, obtainiumSteps, photo, site } from "../content/en.ts";
import { pageHead } from "../page-head.ts";

export const Route = createFileRoute("/")({
  head: () => pageHead("/", `${site.title}. ${site.tagline}`, site.description),
  component: Landing,
});

/** The hero photograph's pixel space, shared by the picture and its construction drawing. */
const HERO_FRAME = { x: 330, y: 700, h: 420, viewBox: "0 0 1080 1360" };

function Photo({
  className,
  sizes,
  priority,
}: {
  className: string;
  sizes: string;
  priority: boolean;
}) {
  return (
    <picture className={className}>
      <source
        type="image/avif"
        srcSet="/brand/atlas-640.avif 640w, /brand/atlas-1080.avif 1080w"
        sizes={sizes}
      />
      <img
        src="/brand/atlas-1080.webp"
        srcSet="/brand/atlas-640.webp 640w, /brand/atlas-1080.webp 1080w"
        sizes={sizes}
        width={1080}
        height={1360}
        alt={photo.alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    </picture>
  );
}

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
          <Photo className="hero-photo" sizes="(max-width: 860px) 100vw, 640px" priority />
          <Construction className="hero-lines" frame={HERO_FRAME} />
        </div>
        <div className="wrap hero-inner">
          <p className="hero-meta label">
            <span>{en.heroKicker}</span>
            <span>{en.heroPlatform}</span>
          </p>
          <div className="hero-copy">
            <div aria-hidden="true">
              <Enhance nearView={false} fallback={<p className="mast">{site.name}</p>}>
                <SplitText
                  text={site.name}
                  tag="p"
                  className="mast"
                  splitType="chars"
                  effect="rise"
                  mask
                  trigger="load"
                  delay={70}
                  duration={1.1}
                  textAlign="left"
                />
              </Enhance>
            </div>
            <p className="tagline">{site.tagline}</p>
            <h1 id="hero-title">{en.heroTitle}</h1>
            <p className="lead">{en.heroLead}</p>
            <div className="actions">
              <a className="button" href={site.latestReleaseUrl} rel="noreferrer">
                {en.downloadRelease}
              </a>
              <a className="button ghost" href={site.obtainiumAddUrl} rel="noreferrer">
                {en.addToObtainium}
              </a>
            </div>
            <p className="label facts">{en.heroFacts}</p>
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
            <Enhance key={paragraph} nearView fallback={<p className="poem-line">{paragraph}</p>}>
              <SplitText
                text={paragraph}
                tag="p"
                className="poem-line"
                splitType="words"
                effect="blur"
                trigger="view"
                threshold={0}
                rootMargin="0px"
                delay={18}
                duration={0.9}
                textAlign="left"
              />
            </Enhance>
          ))}
        </div>
      </section>

      <section className="features wrap" aria-labelledby="features-title">
        <div className="section-head">
          <h2 id="features-title">{en.featuresTitle}</h2>
          <p>{en.featuresLead}</p>
        </div>
        <ul className="feature-grid">
          {features.map((feature) => {
            const body = (
              <>
                <span className="label">{feature.label}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </>
            );
            return (
              <li key={feature.label}>
                <Enhance
                  nearView
                  fallback={<div className="feature-card spotlight-card">{body}</div>}
                >
                  <SpotlightCard
                    className="feature-card"
                    theme="dark"
                    spotlightColor="rgba(236, 230, 216, 0.10)"
                    intensity={0.6}
                    spotlightSize={420}
                    borderGlow={0.25}
                    grain={0}
                  >
                    {body}
                  </SpotlightCard>
                </Enhance>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="paper" aria-labelledby="install-title">
        <div className="wrap paper-grid">
          <div className="paper-copy">
            <h2 id="install-title">{en.installTitle}</h2>
            <p className="lead">{en.installLead}</p>
            <ol className="steps">
              {obtainiumSteps.map((step, index) => (
                <li key={step}>
                  <span className="label">{String(index + 1).padStart(2, "0")}</span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="actions">
              <a className="button" href={site.latestReleaseUrl} rel="noreferrer">
                {en.downloadRelease}
              </a>
              <a className="button ghost" href={site.obtainiumAddUrl} rel="noreferrer">
                {en.addToObtainium}
              </a>
            </div>
          </div>
          <figure className="panel">
            <Photo
              className="panel-photo"
              sizes="(max-width: 860px) 100vw, 560px"
              priority={false}
            />
            <figcaption className="label">{en.photoCaption}</figcaption>
          </figure>
        </div>
      </section>

      <section className="close" aria-labelledby="close-title">
        <div className="seal" aria-hidden="true">
          <Enhance nearView fallback={null}>
            <CircularText
              text={en.closeSeal}
              size={210}
              fontSize={12}
              letterSpacing={4}
              color="var(--muted)"
              spinDuration={40}
              onHover="slowDown"
            />
          </Enhance>
          <Mark size={48} ember />
        </div>
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
