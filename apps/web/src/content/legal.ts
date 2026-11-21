import { site } from "./site.ts";

export interface LegalSection {
  title: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
}

export interface LegalDocument {
  title: string;
  updated: string;
  intro: string;
  sections: readonly LegalSection[];
}

const email = site.supportEmail;

/*
 * DRAFT pending review by the owner and, ideally, a qualified reviewer. Not legal advice. Every
 * statement below was checked against the code on the date of "updated" (packages/auth,
 * packages/email, packages/api media and user-data, docs/guides/sentry.md,
 * .agents/media.md, .agents/sync.md). Decisions the owner still has to make are listed in
 * docs/privacy-readiness.md and in the hand-off notes of the commit that added this site: the
 * contact address, governing law, a retention period for server logs, and the controller's name.
 * Change the text here whenever the app starts collecting or sharing something new.
 */
export const privacy: LegalDocument = {
  title: "Privacy policy",
  updated: "21 November 2026",
  intro: `${site.name} is a private training log. This page says what it collects, where that goes and how to get rid of it. It is written in plain language and covers the ${site.name} Android app and this website.`,
  sections: [
    {
      title: "What we collect",
      items: [
        "Your account: your email address, an optional display name and, if you use Google to sign in, the account id Google gives us.",
        "Your training data: programs, workouts, sessions, sets, notes, records and your preferences.",
        "Your body data: body weight, measurements and any progress or session photos you add.",
        "Sign-in records: when you sign in, our server keeps a session with the time, your IP address and your device's user agent, and the app version you last used.",
        "Crash reports and feedback, described below.",
      ],
    },
    {
      title: "Where it goes",
      items: [
        "Training data, body data, preferences and account details are stored in a database on a server we rent (a virtual private server). The app keeps a copy on your phone, in an encrypted local database, and syncs it with the server so your data works offline and on more than one device. We can technically read what is on the server: it is not end-to-end encrypted.",
        "Photos are stored in a private Cloudflare R2 bucket. Nothing in it is public. Your phone uploads and downloads photos through short-lived signed links, and photos are stripped of location data before they leave your phone.",
        "Sign-in codes are emailed through Resend, which receives your email address and the message.",
        "Cloudflare also sits in front of our servers and this website, so your requests pass through it.",
        "If you sign in with Google, Google processes that sign-in under its own policy.",
        "When it is turned on, Cloudflare Turnstile checks that a sign-in comes from a person. It runs in the app's sign-in screen and sends Cloudflare what its challenge needs, such as device and network signals.",
        "Android builds are downloaded from GitHub Releases, which sees your download request.",
      ],
    },
    {
      title: "Crash reports and feedback",
      paragraphs: [
        "The app can send crash reports and error details to Sentry. They hold the error, the app version and build, your phone model and Android version, and the screens and requests leading up to it, with email addresses removed and no query strings. They do not include your email, your IP address, your account id, workouts, body data or photos. They carry one random id made on your phone, which is not linked to your account.",
        "Crash reports are on by default and you can turn them off in Settings, under Send crash reports. It takes effect at once.",
        "Our server also reports unexpected errors to Sentry, with the request path, the error and your internal user id, but no request body or email.",
        "When you use Send feedback, the message you write goes to us with your device and app version. Your email is added only if you switch on Include my email.",
      ],
    },
    {
      title: "What we do not do",
      items: [
        "We do not show ads.",
        "We do not sell or rent your data.",
        "We do not use third-party analytics or tracking in the app or on this website.",
        "We do not use your data to train AI models.",
      ],
    },
    {
      title: "How long we keep it",
      items: [
        "Your account and training data stay until you delete them or your account.",
        "When you delete a workout, session or photo, it is marked deleted and removed from your devices. The record's content is erased from the database within about 120 days, and a deleted photo is removed from storage within a day.",
        "When you delete your account, your data is deleted from the database and your photos are deleted from storage. Copies in database backups remain until those backups expire, which is up to 14 days. If a backup is ever restored, we remove accounts that were deleted after it was made.",
        "Sign-in sessions end when you sign out or they expire, and are deleted with your account.",
        "Server logs are kept for a limited time for security and debugging and hold no workout or body data.",
        "Crash reports are kept by Sentry for the period its plan allows.",
      ],
    },
    {
      title: "Your choices",
      items: [
        "Export your finished workouts as a CSV file in Settings, under Export data.",
        "Delete your account and all your data from the app: Settings, Account, Delete account. See the delete account page.",
        "Turn off crash reports in Settings.",
        `Ask us to access, correct or delete your data, or to answer a question, by emailing ${email}. We will answer within 30 days.`,
      ],
    },
    {
      title: "Security",
      paragraphs: [
        "Connections to our servers use TLS. The local database on your phone is encrypted, the photo bucket is private, and access to the server is limited to the people who run it. No system is perfectly secure, and a copy of your data on a phone you have lost is protected only by your phone's own lock until you delete your account from another device or sign out.",
      ],
    },
    {
      title: "Health and sensitive data",
      paragraphs: [
        `${site.name} is a training log, not a medical device, and gives no medical advice. Body weight, measurements and photos can be sensitive. You decide whether to add them, and you can delete them at any time.`,
      ],
    },
    {
      title: "Children",
      paragraphs: [
        `${site.name} is not meant for children under 16, and we do not knowingly collect their data.`,
      ],
    },
    {
      title: "Changes and contact",
      paragraphs: [
        "If this policy changes in a way that matters, we will update the date at the top of this page.",
        `Questions or requests: ${email}.`,
      ],
    },
  ],
};

export const terms: LegalDocument = {
  title: "Terms of use",
  updated: "21 November 2026",
  intro: `These terms cover ${site.name} while it is a free beta. By using the app you agree to them. They are short on purpose.`,
  sections: [
    {
      title: "The beta",
      paragraphs: [
        `${site.name} is free and is still being built. Features can change or go away, there can be bugs, and the service can be down. Keep your own copy of anything you cannot lose: you can export your workouts as a CSV file in Settings.`,
      ],
    },
    {
      title: "Your account",
      items: [
        "Use a real email address you control and keep your sign-in codes to yourself.",
        "You are responsible for what happens under your account.",
        "You can delete your account at any time. See the delete account page.",
      ],
    },
    {
      title: "Your data",
      paragraphs: [
        "Your training and body data belong to you. You give us permission to store it, sync it between your devices and process it only to run the app, as described in the privacy policy.",
      ],
    },
    {
      title: "What we ask of you",
      items: [
        "Do not attack, overload or reverse engineer the service, or try to reach other people's data.",
        "Do not use the app to store anything unlawful.",
        "Do not create accounts in bulk or by automation.",
      ],
    },
    {
      title: "Not medical advice",
      paragraphs: [
        "The app records and charts what you tell it. It is not medical or coaching advice. Exercise has risks: check with a professional if you are unsure whether it is safe for you, and stop if something hurts.",
      ],
    },
    {
      title: "No warranty, limited liability",
      paragraphs: [
        "The app is provided as is, without promises that it is accurate, always available or free of errors. To the extent the law allows, we are not liable for lost data, lost profits or any indirect damage from using it, and our total liability is limited to what you paid us, which for the free beta is nothing. Nothing here limits rights you have under the law that cannot be limited.",
      ],
    },
    {
      title: "Ending use",
      paragraphs: [
        "You can stop at any time. We can suspend or remove an account that breaks these terms or harms the service, and we can end the beta with reasonable notice.",
      ],
    },
    {
      title: "Open source and third parties",
      paragraphs: [
        `The source code is published at ${site.githubUrl}. Its licence applies to the code. The ${site.name} name and logo are not licensed for reuse. Parts of the app use third-party software under their own licences.`,
      ],
    },
    {
      title: "Changes and contact",
      paragraphs: [
        "We may update these terms. Continuing to use the app after a change means you accept it, and we will update the date at the top of this page.",
        `Questions: ${site.supportEmail}.`,
      ],
    },
  ],
};

export const deleteAccount = {
  title: "Delete your account",
  intro: `You can delete your ${site.name} account and everything stored with it from inside the app. Nothing is deleted until you confirm from an email link.`,
  steps: [
    "Open the app and go to Settings.",
    "Under Account, tap Delete account.",
    "Type your email address to confirm and tap Delete my account.",
    "Open the email we send you and follow the link. The app opens and your account is deleted.",
  ],
  whatIsDeleted: [
    "Your account, display name and sign-in sessions.",
    "Your programs, workouts, sessions, sets, notes, records and preferences.",
    "Your body weight, measurements and every progress and session photo, including the files in storage.",
    "The copy of your data on devices signed in to the account is wiped the next time they connect.",
  ],
  whatRemains: [
    "Encrypted database backups keep a copy until they expire, up to 14 days. We do not use them except to recover from a failure.",
    "Crash reports already sent to Sentry carry no account information. Server logs hold no workout or body data and expire on their own schedule.",
  ],
  fallbackTitle: "Cannot use the app?",
  fallback: `If you cannot sign in or no longer have the app, email ${site.supportEmail} from the address on your account with the subject "Delete my account". We will confirm it is you and delete the account within 30 days.`,
} as const;
