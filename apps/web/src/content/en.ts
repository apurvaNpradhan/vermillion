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
    "A strength log for lifters who follow a program. Sigil sets the next target, shows its reason, and keeps your log on your phone. Android. Bring your history from Strong or Hevy.",
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
  heroFacts: ["Works offline", "Encrypted on your phone", "No ads, no feed"],
  heroScreenAlt:
    "A workout in progress: two completed sets of bench press and a running rest timer.",
  progressionLabel: "PROGRESSION",
  progressionTitle: "You lift. Sigil does the math.",
  // Checked against packages/shared/src/training/progress: a rep range fills first, then the load
  // rises by one step sized to the equipment (and the gym's loads); three sessions without a gain is
  // a stall; three stalled lifts in a week offer a lighter week at 90% (LIGHTER_WEEK_*).
  progression:
    "Each exercise has a target. Hit the top of your rep range and next time asks for a little more weight, in a step your equipment can make. Every suggestion comes with its reason. Go three sessions without progress and Sigil flags the stall. If several lifts stall in a week, it offers a lighter week at 90% of your load. No spreadsheet. No guessing.",
  featuresTitle: "Everything else stays out of the way.",
  featuresLead: "The plan, the session, the progress and the record. No feed. No coach.",
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
    "Sigil no longer creates share links, so the app cannot add this plan for you. This page stays up for links that were already shared.",
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
    label: "Plan",
    title: "Your next workout is always ready.",
    body: "Build a rotation of workouts and rest days once. Sigil queues each day in order and keeps your place.",
    points: [
      "Skip a day this time, and undo it.",
      "Pause a program. Paused days do not count.",
      "Home shows what is next, last time's top set and this week's numbers.",
    ],
    screenshot: "home",
    alt: "Home with the next workout, its exercises and a Start button",
  },
  {
    label: "Weeks",
    title: "Plan your weeks, deloads included.",
    body: "Give a program a repeating pattern of Build, Push, Test and Deload weeks. Change one week without touching the rest.",
    points: [
      "Each phase says what it does: sets, effort and load.",
      "Deload this week is one tap, and Undo works until you start that session.",
      "A Test week works up to one heavy single.",
    ],
    screenshot: "plan-your-weeks",
    alt: "Plan your weeks, with a repeating pattern of Build, Push and Deload weeks",
  },
  {
    label: "Session",
    title: "Last time's numbers, and a reason for today's.",
    body: "Grey suggestions fill each set, and each one says why. Tick a set and the rest timer starts.",
    points: [
      "A plate calculator that knows your bars and plates, and a warm-up ramp.",
      "Gyms with a max load and load step per machine, so suggestions are loads you can make.",
      "A quiet check when a number looks wrong, like 1000 kg on a 100 kg lift. You can keep it.",
    ],
    screenshot: "live-session",
    alt: "A bench press workout with completed sets and a running rest timer",
  },
  {
    label: "Progress",
    title: "Records and charts, flagged when you set them.",
    body: "Every exercise has a chart and a record grid. Muscle volume shows your weekly sets against a target.",
    points: [
      "A monthly report and a year in review, shared as images if you want.",
      "More than 900 exercises, filtered on a body map.",
    ],
    screenshot: "exercise-detail",
    alt: "A bench press chart of estimated one-rep max with a grid of personal records",
  },
  {
    label: "Your record",
    title: "Saved on your phone first. Yours to take.",
    body: "Your log is encrypted on your phone and syncs when you have signal. Export it whenever you like.",
    points: [
      "Your record as JSON, weigh-ins and measurements as CSV, workouts in Strong's format.",
      "Import a Strong or Hevy history, with a preview before anything is written.",
      "Delete your account from Settings.",
    ],
    screenshot: "history",
    alt: "Training history grouped by week with imported workouts",
  },
];

export const promises = {
  label: "PRIVACY",
  title: "What Sigil leaves out.",
  items: [
    "No ads and no social feed.",
    "No badges, no confetti, no streak guilt. A reminder says what is next.",
    "Crash reports are anonymous and you can turn them off.",
    "Your log syncs to our server over HTTPS so it works on more than one device. The server can read it.",
  ],
};

export const screenshots = [
  { src: "/screenshots/home.webp", alt: "Home with the next workout", caption: "Home" },
  { src: "/screenshots/train.webp", alt: "Train, with the active program", caption: "Train" },
  {
    src: "/screenshots/plan-your-weeks.webp",
    alt: "Plan your weeks, with a repeating pattern of phases",
    caption: "Plan your weeks",
  },
  {
    src: "/screenshots/program.webp",
    alt: "An Upper / Lower program with its weeks and rotation",
    caption: "A program",
  },
  {
    src: "/screenshots/live-session.webp",
    alt: "A workout in progress with a rest timer",
    caption: "A live session",
  },
  {
    src: "/screenshots/exercises.webp",
    alt: "The exercise library with search and filters",
    caption: "The exercise library",
  },
  {
    src: "/screenshots/exercise-detail.webp",
    alt: "An exercise's progress chart and personal records",
    caption: "An exercise",
  },
  { src: "/screenshots/history.webp", alt: "Training history grouped by week", caption: "History" },
];
