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
  title: `${appConfig.displayName}: Strength Log`,
  description: `${appConfig.displayName} is a strength log for Android. Plan programs, log every set offline and keep your personal records.`,
  url: appConfig.urls.site,
  version: appConfig.version,
  supportEmail: appConfig.supportEmail,
  githubUrl,
  releasesUrl: `${githubUrl}/releases`,
  latestApkUrl: `${githubUrl}/releases/latest`,
  /** Obtainium takes the repository URL and follows its GitHub Releases. */
  obtainiumUrl: "https://github.com/ImranR98/Obtainium",
};

/** The one photograph on the site and its required credit (CC BY-SA 3.0). */
export const photo = {
  alt: "Michelangelo's unfinished 'Atlas' Prisoner: a torso emerging from a block of marble.",
  credit: "Michelangelo, 'Atlas' Prisoner. Photo: Jörg Bittner Unna, CC BY-SA 3.0, edited.",
  sourceUrl:
    "https://commons.wikimedia.org/wiki/File:%27Atlas_Slave%27_by_Michelangelo_-_JBU_02.jpg",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
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
  download: "Download",
  downloadApk: "Download the APK",
  addToObtainium: "Add to Obtainium",
  heroKicker: "Strength log",
  heroPlatform: `Android · v${site.version}`,
  heroTitle: "A strength log for Android.",
  heroLead: "Plan programs, log every set offline, and see what you lifted last time.",
  heroFacts: "Works offline · Imports Strong and Hevy · Exports CSV",
  manifestoLabel: "Nonfinito",
  manifestoTitle: "The iron",
  manifestoAccent: "remembers.",
  manifesto: [
    "Every set you finish is written down. The weight, the reps, the rest you took. Some days the bar moves less than you hoped. It still counts.",
    `Weeks pass and the numbers stack. A heavier single. One more rep. When you beat your best, ${site.name} marks it, so you don't have to keep count.`,
  ],
  featuresTitle: "What it does in the gym.",
  featuresLead: "Four things, done properly. No feed, no coach, no streaks.",
  installTitle: "Install it from GitHub.",
  installLead: "Not on iPhone yet.",
  installFacts: `v${site.version} · Android · Signed release`,
  photoCaption: "Unfinished, c. 1530",
  closeSeal: `${appConfig.displayName.toUpperCase()} · STRENGTH LOG · EARN THE MARK · `,
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
    label: "Programs",
    title: "A rotation that queues the next workout.",
    body: "Targets for every exercise, and progression that moves the weight when you hit them.",
    detail: "Push · Pull · Legs / 3 days",
  },
  {
    label: "Live log",
    title: "Every set, as you lift it.",
    body: "Rest timer, last time's numbers in each field, and a plate calculator.",
    detail: "Rest 3:00 / 60 kg × 8",
  },
  {
    label: "Records",
    title: "Personal records, marked when you set them.",
    body: "History and charts show the climb, exercise by exercise.",
    detail: "102.5 kg × 5 / Bench press",
  },
  {
    label: "Offline",
    title: "Saves on the phone first.",
    body: "A basement gym with no signal is fine. Import from Strong or Hevy; export to CSV.",
    detail: "No signal / No sets lost",
  },
];

export const screenshots = [
  { src: "/screenshots/live-session.webp", alt: "A workout in progress with a rest timer" },
  { src: "/screenshots/program.webp", alt: "A training program with three workouts" },
  { src: "/screenshots/exercises.webp", alt: "The exercise library with search and filters" },
];

export const obtainiumSteps = [
  "Install Obtainium from GitHub or F-Droid.",
  `Choose Add app and paste ${githubUrl}.`,
  "Obtainium checks for each new release.",
];
