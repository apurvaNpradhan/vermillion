// Turns the review page's decisions into Catalog patch files. Run
// `pnpm catalog:patches <decisions.json> <proposals-dir> <out-dir> [--app-version 1.2.0]`.
// The patches are checked against the current seed the way the server would apply them; any
// problem fails the run and nothing is written. `--app-version` is the release that understands
// the new detail and equipment slugs (`requires_app_version` of the first two files).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { parseSeed } from "./expansion/catalog.ts";
import { decisionsFileSchema } from "./expansion/decisions.ts";
import {
  buildDetailsPatch,
  buildExpansionPatch,
  buildRanksPatch,
  checkDecisions,
  nonEmpty,
  PATCH_NAMES,
  validatePatches,
  withVersion,
} from "./expansion/patches.ts";
import {
  backfillFileSchema,
  candidatesFileSchema,
  ranksFileSchema,
} from "./expansion/proposals.ts";

const SEED = fileURLToPath(
  new URL("../../packages/api/src/exercise/data/exercises.json", import.meta.url),
);

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { "app-version": { type: "string" } },
});
const [decisionsPath, proposalsDir, outDir] = positionals;
if (decisionsPath === undefined || proposalsDir === undefined || outDir === undefined) {
  console.error(
    "usage: build-patches.ts <decisions.json> <proposals-dir> <out-dir> [--app-version X.Y.Z]",
  );
  process.exit(2);
}
const version = values["app-version"] ?? null;
if (version !== null && !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("--app-version must look like 1.2.0");
  process.exit(2);
}

const readJson = (path: string): ReturnType<typeof JSON.parse> =>
  JSON.parse(readFileSync(path, "utf8"));
const decisions = decisionsFileSchema.parse(readJson(decisionsPath));
const proposals = {
  backfill: backfillFileSchema.parse(readJson(join(proposalsDir, "backfill.json"))),
  candidates: candidatesFileSchema.parse(readJson(join(proposalsDir, "candidates.json"))),
  ranks: ranksFileSchema.parse(readJson(join(proposalsDir, "ranks.json"))),
};
const seed = parseSeed(readFileSync(SEED, "utf8"));

const problems = checkDecisions(decisions, proposals);
const files = [
  {
    name: PATCH_NAMES.details,
    patch: withVersion(buildDetailsPatch(decisions, proposals.backfill, seed), version),
  },
  {
    name: PATCH_NAMES.expansion,
    patch: withVersion(
      buildExpansionPatch(decisions, proposals.candidates, proposals.ranks),
      version,
    ),
  },
  {
    name: PATCH_NAMES.ranks,
    patch: buildRanksPatch(decisions, proposals.ranks, seed),
  },
].filter((file) => nonEmpty(file.patch));
problems.push(...validatePatches(files, seed));

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`${problems.length} problem(s); nothing written`);
  process.exit(1);
}
if (version === null && files.some((file) => file.name !== PATCH_NAMES.ranks)) {
  console.warn("no --app-version: requires_app_version is left out of the patches");
}

mkdirSync(outDir, { recursive: true });
for (const { name, patch } of files) {
  writeFileSync(join(outDir, name), `${JSON.stringify(patch, null, 2)}\n`);
  console.log(
    `${name}: ${patch.insert.length} insert, ${patch.fill.length} fill, ${patch.change.length} change`,
  );
}
if (files.length === 0) console.log("nothing approved: no patch files written");
