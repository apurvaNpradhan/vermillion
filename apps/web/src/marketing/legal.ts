import type { LegalSection } from "./components/pages";

/** The privacy policy's sections, in order (copy in the web namespace, `privacy__*`). */
export const PRIVACY: LegalSection[] = [
  {
    heading: "privacy__collect_heading",
    paragraphs: [
      "privacy__collect_account",
      "privacy__collect_training",
      "privacy__collect_media",
      "privacy__collect_technical",
    ],
  },
  { heading: "privacy__use_heading", paragraphs: ["privacy__use_body", "privacy__use_admin"] },
  {
    heading: "privacy__where_heading",
    paragraphs: ["privacy__where_body", "privacy__where_processors"],
  },
  { heading: "privacy__site_heading", paragraphs: ["privacy__site_body"] },
  { heading: "privacy__keep_heading", paragraphs: ["privacy__keep_body"] },
  { heading: "privacy__rights_heading", paragraphs: ["privacy__rights_body"] },
  { heading: "privacy__contact_heading", paragraphs: ["privacy__contact_body"] },
];

export const TERMS: LegalSection[] = [
  { heading: "terms__beta_heading", paragraphs: ["terms__beta_body"] },
  { heading: "terms__account_heading", paragraphs: ["terms__account_body"] },
  { heading: "terms__use_heading", paragraphs: ["terms__use_body"] },
  { heading: "terms__health_heading", paragraphs: ["terms__health_body"] },
  { heading: "terms__content_heading", paragraphs: ["terms__content_body"] },
  { heading: "terms__end_heading", paragraphs: ["terms__end_body"] },
  { heading: "terms__liability_heading", paragraphs: ["terms__liability_body"] },
  { heading: "terms__changes_heading", paragraphs: ["terms__changes_body"] },
];

export const DELETION: LegalSection[] = [
  { heading: "deletion__app_heading", paragraphs: ["deletion__app_body"] },
  { heading: "deletion__email_heading", paragraphs: ["deletion__email_body"] },
  { heading: "deletion__what_heading", paragraphs: ["deletion__what_body", "deletion__what_kept"] },
];
