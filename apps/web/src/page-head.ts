import { ogAlt, site } from "./content/en.ts";

export type SitePath = "/" | "/screens" | "/privacy" | "/terms" | "/delete-account";

export function pageHead(path: SitePath, title: string, description: string) {
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
      { property: "og:image", content: `${site.url}/brand/og.png` },
      { property: "og:image:alt", content: ogAlt },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
