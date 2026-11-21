import { en, site } from "./content/en.ts";

export function pageHead(
  path: "/" | "/privacy" | "/terms" | "/delete-account",
  title: string,
  description: string,
) {
  const url = new URL(path, site.url).href;

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: site.name },
      { property: "og:url", content: url },
      { property: "og:image", content: `${site.url}/patina-logo-512.png` },
      { property: "og:image:alt", content: en.logoAlt },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
