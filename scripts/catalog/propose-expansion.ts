// Proposes the catalog expansion: detail backfill, new-row candidates and rank tiers, written to
// `<out-dir>` for the review page. Run `pnpm catalog:propose <dataset-dir> <out-dir>`. The dataset
// is untrusted data: it is parsed and validated here, never executed. Nothing it contains is
// committed; only approved decisions end up in patch files (`catalog:patches`).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSeed } from "./expansion/catalog.ts";
import { parseDataset } from "./expansion/dataset.ts";
import { propose, summarise, type Proposals } from "./expansion/propose.ts";

const SEED = fileURLToPath(
  new URL("../../packages/api/src/exercise/data/exercises.json", import.meta.url),
);

const [datasetDir, outDir] = process.argv.slice(2);
if (datasetDir === undefined || outDir === undefined) {
  console.error("usage: propose-expansion.ts <dataset-dir> <out-dir>");
  process.exit(2);
}

const read = (name: string): string => readFileSync(join(datasetDir, name), "utf8");
const source = parseDataset({
  exercises: read("exercises.jsonl"),
  muscles: read("muscles.json"),
  equipment: read("equipment.json"),
  bodyParts: read("body_parts.json"),
});
const proposals = propose(source, parseSeed(readFileSync(SEED, "utf8")));

mkdirSync(outDir, { recursive: true });
const write = (name: string, value: Proposals[keyof Proposals]): void => {
  writeFileSync(join(outDir, name), `${JSON.stringify(value, null, 2)}\n`);
};
write("backfill.json", proposals.backfill);
write("candidates.json", proposals.candidates);
write("ranks.json", proposals.ranks);
console.log(summarise(proposals));
