import { appConfig } from "../../../../app.config.ts";
import { site } from "./en.ts";

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
 * Draft for owner and legal review. See docs/privacy-readiness.md for the open decisions.
 * Update this copy when the app changes what it collects, shares or retains.
 */
export const privacy: LegalDocument = {
  title: "Privacy policy",
  updated: "21 November 2026",
  intro: `This policy covers the ${site.name} Android app and this website. ${site.name} is run by ${appConfig.operator.name}, an individual developer in ${appConfig.operator.country} ("we"), who decides how your data is used. It explains what data we collect, how we use it and how to request deletion.`,
  sections: [
    {
      title: "What we collect",
      items: [
        "Your account includes your email address, display name and any profile picture you add. If you use Google or another available sign-in provider, we store your linked provider account ID and may receive profile details and store sign-in tokens from that provider.",
        "Training data includes programs, workouts, sessions, sets, notes, custom exercises, imported history and preferences.",
        "Body data includes weight, measurements and any progress photos you add. You can also attach photos to sessions.",
        "We record sign-in details such as the time, IP address, user agent and sign-in method. We also record your latest reported app version and when it was last seen.",
        "Our website and API receive technical request information, such as your IP address and the requested page or endpoint, to serve and protect the service.",
        "Crash reports and feedback, described below.",
      ],
    },
    {
      title: "Where it goes",
      items: [
        "We store account details, training data, body data and preferences in a database on a rented server. The app syncs training and body data and preferences with an encrypted database on your phone so you can work offline and use more than one device. Server operators can read the data stored on the server.",
        "Uploaded profile pictures and photos are stored in a private Cloudflare R2 bucket. Your phone uses short-lived signed links to upload and download them. The app re-encodes your uploads on the phone to strip embedded location data.",
        "We use Resend to send account emails, including sign-in codes, sign-in notices and deletion links. Resend receives your email address and the message, which can include the time, IP address, browser and operating system associated with the request.",
        "Cloudflare also sits in front of our servers and this website, so your requests pass through it.",
        "If you use a third-party sign-in provider such as Google, that provider processes the sign-in under its own privacy policy.",
        "When enabled, Cloudflare Turnstile uses device and network signals to check requests such as sending a sign-in code or starting a third-party sign-in. The server sends the challenge token to Cloudflare for verification.",
        "GitHub handles visits to our release page and any Android downloads from GitHub Releases.",
        "Authorized administrators can see account details, sign-in information, the last reported app version, account restrictions and record counts in their account view.",
      ],
    },
    {
      title: "Crash reports and feedback",
      paragraphs: [
        "In builds with Sentry configured, the app can send crash reports and error details. These can include stack traces, app and Android versions, device model, recent screens and request URLs, and console messages. The app uses a random ID made on your device in place of your account ID, removes query strings from request URLs and redacts email addresses from error messages.",
        "In those builds, crash reporting is on by default. You can turn it off on each device in Settings under Send crash reports.",
        "When server reporting is enabled, Sentry can receive unexpected server errors, including the request method and path, the error and, when available, your internal account ID. The server strips request bodies and query strings and redacts email addresses from error messages.",
        "Feedback you submit in the app goes to Sentry with device and app details. The app attaches your account email if you turn on Include my email. Feedback can be sent with crash reporting turned off. In a build without Sentry, Send feedback opens your email app.",
      ],
    },
    {
      title: "Website cookies",
      paragraphs: [
        "The website itself sets no cookies and includes no advertising or analytics scripts.",
      ],
    },
    {
      title: "How long we keep it",
      items: [
        "When you delete a workout or session, the app hides it from your synced training log. The server keeps the deleted record until account deletion. Some other sync records, such as upload receipts, are eligible for cleanup after 120 days.",
        "When a photo deletion syncs, an hourly job removes the file from storage after it has been marked deleted for at least an hour. A minimal deletion record can remain until account deletion.",
        "Account deletion removes your account and training and body data from the live database and starts cleanup of your files in storage. Copies can remain in database backups until those backups expire.",
        "Sign-in sessions end when you sign out or they expire. Account deletion removes them from the live database.",
        "Operational logs, administrative audit records and Sentry reports can be retained separately from your account. Some of these records can include an internal account ID.",
      ],
    },
    {
      title: "Your choices",
      items: [
        "Export your finished workouts as a CSV file in Settings, under Export data.",
        "Delete your account and all your data from the app: Settings, Account, Delete account. See the delete account page.",
        "Turn off crash reports in Settings.",
        `To ask about accessing, correcting or deleting your data, email ${email}.`,
      ],
    },
    {
      title: "Security",
      paragraphs: [
        "Public connections to our servers use HTTPS. Your phone's local database is encrypted and uploaded photos are kept in private storage. A device can keep a local copy after losing access to the account. Account deletion cannot remotely erase data from a lost or offline device.",
      ],
    },
    {
      title: "Health and sensitive data",
      paragraphs: [
        "Body weight, measurements and photos can be sensitive. Adding them is optional.",
      ],
    },
    {
      title: "Changes and contact",
      paragraphs: [
        `${site.name} is for people aged 16 or older. We do not knowingly collect data from younger children; if you believe a child under 16 has an account, contact us and we will delete it.`,
        "If this policy changes in a way that matters, we will update the date at the top of this page.",
        `Questions or requests: ${email}.`,
      ],
    },
  ],
};

export const terms: LegalDocument = {
  title: "Terms of use",
  updated: "21 November 2026",
  intro: `These terms cover the ${site.name} beta, run by ${appConfig.operator.name} in ${appConfig.operator.country}. You must be 16 or older to use it.`,
  sections: [
    {
      title: "The beta",
      paragraphs: [
        `${site.name} is in development. Features can change and the service can be unavailable. You can export finished workouts as a CSV file in Settings.`,
      ],
    },
    {
      title: "Your account",
      items: [
        "Use a real email address you control and keep your sign-in codes to yourself.",
        "You are responsible for what happens under your account.",
        "You can request account deletion in the app or by contacting support. See the delete account page.",
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
        "Do not attack or overload the service, or try to access other people's data.",
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
        "The app is provided as is, without promises that it is accurate, always available or free of errors. To the extent the law allows, we are not liable for lost data, lost profits or any indirect damage from using it, and our total liability is limited to what you paid us. Nothing here limits rights you have under the law that cannot be limited.",
      ],
    },
    {
      title: "Ending use",
      paragraphs: [
        "You can stop using the app at any time. We can suspend or remove an account that breaks these terms or harms the service.",
      ],
    },
    {
      title: "Source code and third parties",
      paragraphs: [
        `The source code is available at ${site.githubUrl}. Parts of the app use third-party software under their own licences.`,
      ],
    },
    {
      title: "Governing law",
      paragraphs: [
        `These terms are governed by the laws of ${appConfig.operator.country}, and the courts of ${appConfig.operator.country} have jurisdiction over any dispute, without taking away protections you have under the law where you live.`,
      ],
    },
    {
      title: "Changes and contact",
      paragraphs: [
        "If we change these terms, we will update the date at the top of this page.",
        `Questions: ${site.supportEmail}.`,
      ],
    },
  ],
};

export const deleteAccount = {
  title: "Delete your account",
  intro: `You can request deletion of your ${site.name} account and its data in the app or by contacting support.`,
  steps: [
    "Open the app and go to Settings.",
    "Under Account, tap Delete account.",
    "Type your email address to confirm and tap Delete my account.",
    "Open the link in the email within one hour. Stay signed in to the same account in the app.",
    "On the confirmation screen, tap Delete my account again while connected to the internet.",
  ],
  whatIsDeleted: [
    "Your account, linked sign-in accounts and sessions.",
    "Your programs, workouts, sessions, sets, notes, records and preferences in the live database.",
    "Your body weight and measurements. The server also clears your profile picture and progress and session photos from storage, with follow-up jobs to remove any remaining files.",
  ],
  whatRemains: [
    "The app tries to clear local data on the device where you requested and confirmed deletion. Other devices can still hold a local copy, especially if they are offline. Clear the app's stored data on those devices to remove it.",
    "Copies may remain in database backups until the backups expire. Operational logs, audit records, crash reports and feedback are kept separately and can outlast account deletion.",
  ],
  fallbackTitle: "Cannot use the app?",
  fallback: `To request account deletion without the app, email ${site.supportEmail} from the address on your account with the subject “Delete my account”.`,
};
