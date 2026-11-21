import { appConfig } from "../../../../app.config.ts";

/**
 * English is the site's only locale. The copy here and in legal.ts is resolved at build time.
 * The name, tagline, support address and deployment URL come from app.config.ts.
 */

const { owner, repo } = appConfig.releases;
const githubUrl = `https://github.com/${owner}/${repo}`;

export const site = {
  name: appConfig.publicSite.displayName,
  tagline: appConfig.tagline,
  /** The site's own line (`appConfig.subtitle` is the store-listing line and may differ). */
  subtitle: "A private log for training.",
  description: `Log workouts offline, follow training programs and track your progress with ${appConfig.publicSite.displayName}.`,
  url: appConfig.publicSite.url,
  supportEmail: appConfig.supportEmail,
  githubUrl,
  releasesUrl: `${githubUrl}/releases`,
  /** Obtainium takes the repository URL and follows its GitHub Releases. */
  obtainiumUrl: "https://github.com/ImranR98/Obtainium",
};

export const en = {
  skipToContent: "Skip to content",
  homeLink: `${site.name} home`,
  logoAlt: `${site.name} tortoise logo`,
  releases: "Android releases",
  iosNote: "iOS is not available yet.",
  features: "What it does",
  screenshots: "Screenshots",
  updatesTitle: "Get updates with Obtainium",
  updatesIntro:
    "Obtainium can install an Android build from GitHub Releases once one is available.",
  updatesLink: "Get Obtainium",
  footer: "Footer",
  privacyLink: "Privacy",
  termsLink: "Terms",
  deletionLink: "Delete account",
  github: "GitHub",
  notFoundTitle: "Page not found",
  notFoundBody: "That page does not exist, or it moved.",
  backHome: "Back to the home page",
  lastUpdated: (date: string) => `Last updated ${date}`,
  deletionSteps: "In the app",
  deletionScope: "What is deleted",
  deletionRetention: "What may remain",
  emailSupport: "Email support",
};

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
    body: "Review your past sessions, personal records and progress charts.",
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
    body: "Your training log is private to your account. App crash reporting is optional.",
  },
];

export const screenshots = [
  { src: "/screenshots/live-session.webp", alt: "A workout in progress with a rest timer" },
  { src: "/screenshots/program.webp", alt: "A training program with three workouts" },
  { src: "/screenshots/exercises.webp", alt: "The exercise library with search and filters" },
];

export const obtainiumSteps = [
  "Install Obtainium from its GitHub page or F-Droid.",
  `In Obtainium choose Add app and paste ${githubUrl}.`,
  "Add the repository to follow new Android releases.",
];
