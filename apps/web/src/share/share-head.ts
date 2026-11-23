import { snapshotTitle, type ShareSnapshot } from "@workspace/shared";

import { en, site } from "../content/en.ts";

/**
 * The head of a Share link page. Share links are private to whoever holds them, so search engines
 * are told to skip them, and the canonical URL is the page's own.
 */
export function shareHead(path: string, snapshot: ShareSnapshot | null) {
  const name = snapshot
    ? (snapshotTitle(snapshot) ?? en.shareUntitledWorkout)
    : en.shareMissingTitle;
  const title = `${name} | ${site.name}`;
  const description = snapshot ? en.shareOpenHint : en.shareMissingBody;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:site_name", content: site.name },
      { property: "og:url", content: new URL(path, site.url).href },
      { property: "og:image", content: `${site.url}/brand/og.png` },
    ],
  };
}
