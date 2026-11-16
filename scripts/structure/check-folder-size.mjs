// Fails when a source folder holds too many loose files, so verticals stay navigable.
//
// Inside a vertical, files are grouped into feature folders (see .agents/verticals.md,
// "Inside a vertical"). Twenty loose non-test source files is the point where a folder stops being
// scannable at a glance; the convention aims for about fifteen, the check fails at more than
// twenty so a small overshoot does not block a change. Tests, asset files and subfolders are not
// counted. Folders on the allowlist predate the rule and are owned by work in progress elsewhere:
// shrink them, then remove them from the list.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const LIMIT = 20;
const TREES = ["apps/native/src", "packages/shared/src", "packages/sync/src"];
const ALLOWLIST = new Set(["apps/native/src/platform/ui"]);
const SOURCE = /\.(?:tsx?|mts|mjs|js)$/;
const TEST = /\.test\.(?:tsx?|mts|mjs|js)$/;

const root = resolve(import.meta.dirname, "../..");
const tracked = execFileSync("git", ["ls-files", "--", ...TREES], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((file) => SOURCE.test(file) && !TEST.test(file));

const counts = new Map();
for (const file of tracked) counts.set(dirname(file), (counts.get(dirname(file)) ?? 0) + 1);

const failures = [...counts]
  .filter(([folder, count]) => count > LIMIT && !ALLOWLIST.has(folder))
  .toSorted(([a], [b]) => a.localeCompare(b));

for (const [folder, count] of failures) {
  console.error(
    `${folder}: ${count} loose source files (limit ${LIMIT}). Group them into feature folders.`,
  );
}
if (failures.length > 0) process.exit(1);
