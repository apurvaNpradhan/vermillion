// Compares the reference locale with the keys the source code uses: keys the
// code uses that no locale defines, and keys nothing uses. A plural family
// counts as used when its base key appears.
import fs from "node:fs/promises";
import path from "node:path";

import { loadLocales, pluralBase, repoRoot, sorted } from "./shared.mjs";

const SOURCE_ROOTS = [
  "apps/web/src",
  "apps/native/src",
  "apps/native/app",
  "apps/server/src",
  "packages",
];
const SKIP = new Set(["node_modules", "dist", "locales", ".turbo", "routeTree.gen.ts"]);
// Appears in documentation comments as the naming pattern.
const IGNORED = new Set(["feature__identifier"]);
const KEY_IN_SOURCE = /["'`]([a-z]+__[a-z_]+)["'`]/gu;

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|mjs)$/u.test(entry.name) && !/\.(test|d)\.[mc]?[jt]sx?$/u.test(entry.name))
      yield full;
  }
}

const used = new Set();
for (const root of SOURCE_ROOTS) {
  for await (const file of walk(path.join(repoRoot, root))) {
    const text = await fs.readFile(file, "utf8");
    for (const match of text.matchAll(KEY_IN_SOURCE))
      if (!IGNORED.has(match[1])) used.add(match[1]);
  }
}

const { reference } = await loadLocales();
const defined = new Set(Object.keys(reference.data));
const definedBases = new Set([...defined].map((key) => pluralBase(key) ?? key));

const missing = [...used].filter((key) => !defined.has(key) && !definedBases.has(key));
const unused = [...defined].filter((key) => !used.has(key) && !used.has(pluralBase(key) ?? key));

for (const [title, keys] of [
  ["Keys used in code but not defined", missing],
  ["Keys defined but not used in code", unused],
]) {
  if (keys.length === 0) continue;
  console.log(`${title}:`);
  for (const key of sorted(keys)) console.log(`  - ${key}`);
}

if (missing.length === 0 && unused.length === 0) console.log("Translation keys match the code.");
process.exit(missing.length + unused.length === 0 ? 0 : 1);
