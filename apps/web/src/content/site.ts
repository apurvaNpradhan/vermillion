import { appConfig } from "../../../../app.config.ts";

/**
 * All English copy and links for the public site live in this folder. The site has no i18n:
 * `@workspace/i18n` serves the app, the API and email, and the site is English only for now.
 * Name, tagline, support address and URLs come from `app.config.ts`.
 */

const { owner, repo } = appConfig.releases;
const githubUrl = `https://github.com/${owner}/${repo}`;

export const site = {
  name: appConfig.displayName,
  tagline: appConfig.tagline,
  /** The site's own line (`appConfig.subtitle` is the store-listing line and may differ). */
  subtitle: "A private log for training.",
  description: `${appConfig.displayName}: ${appConfig.tagline} A private log for training.`,
  url: appConfig.urls.site,
  supportEmail: appConfig.supportEmail,
  githubUrl,
  releasesUrl: `${githubUrl}/releases/latest`,
  /** Obtainium takes the repository URL and follows its GitHub Releases. */
  obtainiumUrl: "https://github.com/ImranR98/Obtainium",
} as const;

export const features = [
  {
    title: "Programs and workouts",
    body: "Plan a rotation of workouts, set targets for every exercise and follow the next one.",
  },
  {
    title: "Live logging",
    body: "Log sets as you train, with rest timers, ghost values from last time and a plate calculator.",
  },
  {
    title: "History and records",
    body: "Every session is kept. Personal records and progress charts show up without any setup.",
  },
  {
    title: "Body weight and measurements",
    body: "Track weight with a trend line, take measurements and keep progress photos in private storage.",
  },
  {
    title: "Muscle volume",
    body: "See the weekly sets each muscle gets against a target, on a body map.",
  },
  {
    title: "Bring your data, take it back",
    body: "Import your history from Strong or Hevy. Export every finished workout as a CSV file.",
  },
  {
    title: "Works offline",
    body: "The gym basement is fine. Everything saves on your phone first and syncs when you are back online.",
  },
  {
    title: "Private",
    body: "No ads, no selling data and no third-party analytics.",
  },
] as const;

export const screenshots = [
  { src: "/screenshots/live-session.webp", alt: "A workout in progress with a rest timer" },
  { src: "/screenshots/program.webp", alt: "A training program with three workouts" },
  { src: "/screenshots/exercises.webp", alt: "The exercise library with search and filters" },
] as const;

export const obtainiumSteps = [
  "Install Obtainium from its GitHub page or F-Droid.",
  `In Obtainium choose Add app and paste ${githubUrl}.`,
  "Add it. Obtainium installs the latest release and tells you when a new one is out.",
] as const;
