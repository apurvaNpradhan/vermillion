import { readFileSync } from "node:fs";

import { appConfig } from "../../../app.config.ts";

/**
 * wrangler.jsonc cannot import app.config.ts, so its custom domain is written out. This fails
 * the deploy when the two disagree.
 */
const expected = new URL(appConfig.urls.site).hostname;
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const patterns = [...wrangler.matchAll(/"pattern"\s*:\s*"([^"]+)"/g)].map((match) => match[1]);

if (patterns.length !== 1 || patterns[0] !== expected) {
  console.error(
    `wrangler.jsonc routes ${patterns.join(", ") || "nothing"}, but app.config.ts says the site is ${expected}.`,
  );
  process.exit(1);
}
console.log(`wrangler.jsonc custom domain matches app.config.ts: ${expected}`);
