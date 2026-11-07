import { canonicalUrl } from "./head";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** sitemap.xml for the public pages. */
export function buildSitemap(origin: string, paths: readonly string[]): string {
  const urls = paths
    .map((path) => `  <url><loc>${escapeXml(canonicalUrl(origin, path))}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** robots.txt: public pages are open, the signed-in app and API are not crawled. */
export function buildRobots(origin: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /app",
    "Disallow: /settings",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /rpc/",
    `Sitemap: ${new URL("/sitemap.xml", origin).href}`,
    "",
  ].join("\n");
}
