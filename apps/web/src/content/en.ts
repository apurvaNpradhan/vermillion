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
  title: `${appConfig.displayName} — the strength log that progresses for you`,
  description:
    "Run your own program on Android. Keep your place in the rotation, see what you lifted last time, and bring your history from Strong or Hevy.",
  url: appConfig.urls.site,
  version: appConfig.version,
  supportEmail: appConfig.supportEmail,
  githubUrl,
  /** The latest GitHub release; its APK is listed under Assets. */
  latestReleaseUrl: `${githubUrl}/releases/latest`,
};

/** Alt text for the social preview image. */
export const ogAlt = "Sigil, the strength log that progresses for you.";

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
  heroOverline: "STRENGTH LOG · ANDROID",
  heroTitle: "Hit your reps. The weight goes up.",
  heroLead:
    "Sigil runs your program. It lines up the next workout, sets a target for every exercise, and adds weight when you hit it. If you stall, it eases off.",
  download: "Download for Android",
  heroFacts: ["Works offline"],
  heroScreenAlt:
    "A workout in progress: two completed sets of bench press and a running rest timer.",
  progressionLabel: "PROGRESSION",
  progressionTitle: "You lift. Sigil does the math.",
  // Checked against packages/shared/src/training/progress: a rep range fills first, then the
  // load rises by ~2.5% (never below 2.5 kg on a barbell); three sessions with under 1% gain is a stall.
  progression:
    "Each exercise has a target. Hit the top of your rep range and next time asks for more weight: about 2.5% of the load, never less than 2.5 kg on a barbell. Go three sessions without progress and Sigil flags the stall and suggests 90% of your last weight. No spreadsheet. No guessing.",
  featuresTitle: "Everything else stays out of the way.",
  featuresLead: "Four things, done properly. No feed. No coach.",
  installTitle: "On Android, through GitHub.",
  installLead: "Not on iPhone yet.",
  installSteps: [
    "Open the latest release on GitHub.",
    "Download the APK listed under Assets.",
    "Open it on your phone and allow the install.",
  ],
  closeTitle: "Your next session already knows the weight.",
  screensTitle: "Screens.",
  screensLead: "The app as it is today, on a real phone with a real training log.",
  shareProgramLabel: "SHARED PROGRAM",
  shareWorkoutLabel: "SHARED WORKOUT",
  shareUntitledWorkout: "Workout",
  shareRestDay: "Rest",
  shareCode: "Code",
  shareOpenHint:
    "Already have Sigil? Open this page on your phone and the app opens. Or choose Settings, then Enter code, and type the code.",
  shareWeeks: (count: number) => `${count} ${count === 1 ? "week" : "weeks"}`,
  shareDays: (count: number) => `${count} ${count === 1 ? "day" : "days"} a week`,
  shareExercises: (count: number) => `${count} ${count === 1 ? "exercise" : "exercises"}`,
  shareDayN: (day: number) => `Day ${day}`,
  shareMissingTitle: "Link not found",
  shareMissingBody: "Check the code. It has six characters, and no zero, one, I, L or O.",
  shareGoneTitle: "This link was turned off",
  shareGoneBody: "Its owner revoked it. Ask them for a new one.",
  shareErrorTitle: "Could not load this link",
  shareErrorBody: "Try again in a moment.",
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
    label: "Programs",
    title: "Your next workout is always ready.",
    body: "Build a rotation once. Sigil queues each day in order and remembers where you left off.",
    screenshot: "program",
    alt: "A Push Pull Legs program with its workout order",
  },
  {
    label: "Live log",
    title: "Last time's numbers, already filled in.",
    body: "Tick a set and the rest timer starts. Plate math and warm-ups are built in.",
    screenshot: "live-session",
    alt: "A bench press workout with completed sets and a running rest timer",
  },
  {
    label: "Records",
    title: "Records flagged the moment you set them.",
    body: "Every exercise gets a chart, so you can watch the numbers climb.",
    screenshot: "exercise-detail",
    alt: "A bench press chart of estimated one-rep max with a grid of personal records",
  },
  {
    label: "Offline",
    title: "Works in a basement.",
    body: "Everything saves on your phone first and syncs once you have signal. Bring your history from Strong or Hevy.",
    screenshot: "history",
    alt: "Training history grouped by week with imported workouts",
  },
];

export const screenshots = [
  { src: "/screenshots/live-session.webp", alt: "A workout in progress with a rest timer" },
  { src: "/screenshots/program.webp", alt: "A Push Pull Legs program with four workouts" },
  { src: "/screenshots/exercises.webp", alt: "The exercise library with search and filters" },
  {
    src: "/screenshots/exercise-detail.webp",
    alt: "An exercise's progress chart and personal records",
  },
  { src: "/screenshots/history.webp", alt: "Training history grouped by week" },
];
