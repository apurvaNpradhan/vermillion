import { createFileRoute } from "@tanstack/react-router";

import {
  CircularText,
  ClientOnly,
  Magnet,
  Noise,
  ScrollReveal,
  SplitText,
  SpotlightCard,
} from "../components/client-only.tsx";
import { Construction } from "../components/construction.tsx";
import { Mark } from "../components/mark.tsx";
import { en, features, obtainiumSteps, photo, site } from "../content/en.ts";
import { pageHead } from "../page-head.ts";

export const Route = createFileRoute("/")({
  head: () => pageHead("/", `${site.title}. ${site.tagline}`, site.description),
  component: Landing,
});

/** The hero photograph's pixel space, shared by the picture and its construction drawing. */
const HERO_FRAME = { x: 330, y: 700, h: 420, viewBox: "0 0 1080 1456" };

function Photo({ className, sizes }: { className: string; sizes: string }) {
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
        height={1456}
        alt={photo.alt}
      />
    </picture>
  );
}

function DownloadButton() {
  const button = (
    <a className="button" href={site.latestApkUrl} rel="noreferrer">
      {en.downloadApk}
    </a>
  );
  return (
    <ClientOnly fallback={button}>
      <Magnet padding={60} magnetStrength={4}>
        {button}
      </Magnet>
    </ClientOnly>
  );
}

function Landing() {
  return (
    <>
      <ClientOnly fallback={null}>
        <Noise
          opacity={0.05}
          size={1.1}
          fps={10}
          blendMode="overlay"
          dust={0.02}
          scratches={0}
          fixed
          zIndex={60}
        />
      </ClientOnly>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-figure">
          <Photo className="hero-photo" sizes="(max-width: 860px) 100vw, 640px" />
          <ClientOnly
            fallback={<Construction animate={false} className="hero-lines" frame={HERO_FRAME} />}
          >
            <Construction animate className="hero-lines" frame={HERO_FRAME} />
          </ClientOnly>
        </div>
        <div className="wrap hero-inner">
          <p className="hero-meta label">
            <span>{en.heroKicker}</span>
            <span>{en.heroPlatform}</span>
          </p>
          <div className="hero-copy">
            <ClientOnly
              fallback={
                <p className="mast" aria-hidden="true">
                  {site.name}
                </p>
              }
            >
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
            </ClientOnly>
            <p className="tagline">{site.tagline}</p>
            <h1 id="hero-title">{en.heroTitle}</h1>
            <p className="lead">{en.heroLead}</p>
            <div className="actions">
              <DownloadButton />
              <a className="button ghost" href={site.obtainiumUrl} rel="noreferrer">
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
            <ClientOnly key={paragraph} fallback={<p className="poem-line">{paragraph}</p>}>
              <ScrollReveal
                enableBlur
                blurStrength={6}
                baseOpacity={0.14}
                baseRotation={0}
                effect="fade"
                mode="scrub"
                textClassName="poem-line"
              >
                {paragraph}
              </ScrollReveal>
            </ClientOnly>
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
                <span className="label detail">{feature.detail}</span>
              </>
            );
            return (
              <li key={feature.label}>
                <ClientOnly fallback={<div className="feature-card spotlight-card">{body}</div>}>
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
                </ClientOnly>
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
              <a className="button" href={site.latestApkUrl} rel="noreferrer">
                {en.downloadApk}
              </a>
            </div>
            <p className="label facts">{en.installFacts}</p>
          </div>
          <figure className="panel">
            <Photo className="panel-photo" sizes="(max-width: 860px) 100vw, 560px" />
            <figcaption className="label">{en.photoCaption}</figcaption>
          </figure>
        </div>
      </section>

      <section className="close" aria-labelledby="close-title">
        <div className="seal">
          <ClientOnly fallback={null}>
            <CircularText
              text={en.closeSeal}
              size={210}
              fontSize={12}
              letterSpacing={4}
              color="#A39D90"
              spinDuration={40}
              onHover="slowDown"
            />
          </ClientOnly>
          <Mark size={48} ember />
        </div>
        <p id="close-title" className="close-title">
          {site.tagline}
        </p>
        <DownloadButton />
      </section>
    </>
  );
}
