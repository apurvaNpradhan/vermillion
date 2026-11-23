import { appConfig } from "../../../../app.config.ts";

/**
 * English is the site's only locale. The copy here and in legal.ts is resolved at build time.
 * The name, tagline, support address and deployment URL come from app.config.ts.
 */

const { owner, repo } = appConfig.releases;
const githubUrl = `https://github.com/${owner}/${repo}`;

export const site = {
  name: appConfig.displayName,
  tagline: appConfig.tagline,
  title: `${appConfig.displayName} | Programs, workouts and progress`,
  description:
    "Run your own program on Android. Keep your place in the rotation, see what you lifted last time, and bring your history from Strong or Hevy.",
  url: appConfig.urls.site,
  version: appConfig.version,
  supportEmail: appConfig.supportEmail,
  githubUrl,
  /** The latest GitHub release; its APK is listed under Assets. */
  latestReleaseUrl: `${githubUrl}/releases/latest`,
};

export const photo = {
  alt: "Michelangelo's unfinished 'Atlas' Prisoner: a torso emerging from a block of marble.",
};

export const en = {
  skipToContent: "Skip to content",
  homeLink: `${site.name} home`,
  primaryNav: "Primary",
  footer: "Footer",
  screensLink: "Screens",
  privacyLink: "Privacy",
  termsLink: "Terms",
  deletionLink: "Delete account",
  github: "GitHub",
  downloadNav: "Android APK",
  downloadRelease: "Get the Android APK",
  licensesLink: "Licences",
  heroPlatform: `Android · v${site.version}`,
  heroTitle: "Your program moves when you lift.",
  heroLead:
    "Finish a workout and Sigil lines up the next one. Your last weights and reps are there when you start.",
  manifestoLabel: "Nonfinito",
  manifestoTitle: "The log",
  manifestoAccent: "is yours.",
  manifesto: [
    "The work was yours before it was in this app. Bring over the workouts you logged in Strong or Hevy and start with your own numbers.",
    "Sets save on the phone as you go, even in a gym with no signal. If you take your training elsewhere, export your finished workouts as a CSV.",
  ],
  featuresTitle: "From the next workout to the next plate.",
  screensTitle: "Screens.",
  screensLead: "The app as it is today, on a real phone with a real training log.",
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
    label: "Program rotation",
    title: "Miss Tuesday. Keep your place.",
    body: "Build the rotation you want, including rest days. Sigil suggests the next workout based on what you actually trained.",
    screenshot: "program",
    alt: "A Push Pull Legs program with its workout order",
  },
  {
    label: "Set logging",
    title: "See last time at a glance.",
    body: "Previous weights and reps sit beside the current set. Between sets, use the rest timer and work out what goes on the bar.",
    screenshot: "live-session",
    alt: "A bench press workout with completed sets and a running rest timer",
  },
  {
    label: "Progression",
    title: "See what changed before you lift.",
    body: "Compare today’s suggested sets with your last session. Look up the exercise’s records and check how often its muscles have been trained.",
  },
];

export const screenshots = [
  { src: "/screenshots/live-session.webp", alt: "A workout in progress with a rest timer" },
  { src: "/screenshots/program.webp", alt: "A training program with three workouts" },
  { src: "/screenshots/exercises.webp", alt: "The exercise library with search and filters" },
];
