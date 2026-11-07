export type SeoInput = {
  /** Page title without the app name. Omit for the home page. */
  title?: string;
  description: string;
  /** Path of this page, for the canonical URL. */
  path: string;
  appName: string;
  /** Public origin, for example `https://app.example.com`. */
  origin: string;
  /** Keep the page out of search results (app and auth screens). */
  noindex?: boolean;
};

/** Absolute canonical URL: origin plus path, no query, no hash, no trailing slash except the root. */
export function canonicalUrl(origin: string, path: string): string {
  const url = new URL(path, origin);
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  return `${new URL(origin).origin}${pathname}`;
}

/** TanStack Router `head()` result: title, description, canonical, Open Graph and robots. */
export function seoHead(input: SeoInput) {
  const title = input.title ? `${input.title} · ${input.appName}` : input.appName;
  const canonical = canonicalUrl(input.origin, input.path);
  return {
    meta: [
      { title },
      { name: "description", content: input.description },
      { property: "og:title", content: title },
      { property: "og:description", content: input.description },
      { property: "og:url", content: canonical },
      { property: "og:site_name", content: input.appName },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      ...(input.noindex ? [{ name: "robots", content: "noindex, nofollow" }] : []),
    ],
    links: input.noindex ? [] : [{ rel: "canonical", href: canonical }],
  };
}
