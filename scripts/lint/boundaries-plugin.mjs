// Local oxlint plugin: `boundaries/vertical-boundaries`.
//
// Code lives in verticals (folders named by what they do). Another vertical may
// be reached only through its `index.ts`. `platform` is shared infrastructure
// and may be imported from anywhere. Each source tree below follows the same
// layout: `platform/` plus one folder per domain. Folders listed in `plain` are
// not verticals and are not restricted.
// Tests are exempt, and table files (`schema.ts`/`tables.ts`) may import each
// other because tables reference each other through foreign keys.
import { dirname, join, relative, resolve, sep } from "node:path";

const SHARED = new Set(["platform"]);

/**
 * `alias` maps an import prefix to the folder it points at, relative to the
 * repo root. `plain` lists top-level folders that are not verticals.
 */
export const TREES = {
  "packages/api/src": { plain: new Set(), alias: {} },
  // Client sync infrastructure: `platform/` plus one folder per synced vertical.
  "packages/sync/src": { plain: new Set(), alias: {} },
  "apps/native/src": {
    plain: new Set(),
    // Routes in `app/` are thin; modules live under `src`.
    alias: { "@/": "apps/native/src/" },
  },
};

const root = resolve(import.meta.dirname, "../..");

/** { base, vertical, rest } for a path inside a known source tree, else null. */
function locate(absolute) {
  const rel = relative(root, absolute).split(sep).join("/");
  for (const [base, tree] of Object.entries(TREES)) {
    if (rel === base || !rel.startsWith(`${base}/`)) continue;
    const [first, ...tail] = rel.slice(base.length + 1).split("/");
    // A bare file in the tree root (`src/index.ts`) has no vertical.
    const isVertical = tail.length > 0 && !tree.plain.has(first);
    return {
      base,
      vertical: isVertical ? first : null,
      rest: isVertical ? tail.join("/") : [first, ...tail].join("/"),
    };
  }
  return null;
}

function resolveSpecifier(specifier, filename) {
  if (specifier.startsWith(".")) return resolve(dirname(filename), specifier);
  for (const [base, tree] of Object.entries(TREES)) {
    // An alias only applies to files of the app that declares it.
    const app = base.split("/").slice(0, 2).join("/");
    if (!filename.startsWith(join(root, app) + sep)) continue;
    for (const [prefix, target] of Object.entries(tree.alias))
      if (specifier.startsWith(prefix)) return join(root, target, specifier.slice(prefix.length));
  }
  return null;
}

// The client sync package carries the isolated drizzle-orm@0.45; it must never reach the server
// schema or server packages (ADR 0016).
const SYNC_FORBIDDEN = /^(@workspace\/(db|api|auth|email|env)(\/|$)|drizzle-orm\/pg-core$)/;

const isIndex = (rest) => /^index(\.[cm]?[jt]sx?)?$/.test(rest) || rest === "";
const isTable = (rest) => /^(schema|tables)(\.[cm]?[jt]sx?)?$/.test(rest);

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Import another vertical only through its index.ts (platform is shared).",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (/\.test\.[cm]?[jt]sx?$/.test(filename)) return {};
    const here = locate(filename);
    if (!here) return {};

    const inSync = relative(root, filename).split(sep).join("/").startsWith("packages/sync/");

    function check(node, specifier) {
      if (typeof specifier !== "string") return;
      if (inSync && SYNC_FORBIDDEN.test(specifier)) {
        context.report({
          node,
          message: `packages/sync must not import "${specifier}" (server-only; see ADR 0016).`,
        });
        return;
      }
      const absolute = resolveSpecifier(specifier, filename);
      if (!absolute) return;
      const target = locate(absolute);
      if (!target || target.base !== here.base || !target.vertical) return;
      if (target.vertical === here.vertical) return;
      if (SHARED.has(target.vertical)) return;
      if (isIndex(target.rest)) return;
      if (isTable(target.rest) && (SHARED.has(here.vertical) || isTable(here.rest))) return;
      context.report({
        node,
        message: `Import "${specifier}" reaches into the "${target.vertical}" vertical; import its index instead.`,
      });
    }

    return {
      ImportDeclaration: (node) => check(node, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node, node.source.value),
      ExportAllDeclaration: (node) => check(node, node.source.value),
      ImportExpression: (node) => node.source.type === "Literal" && check(node, node.source.value),
    };
  },
};

export default {
  meta: { name: "boundaries" },
  rules: { "vertical-boundaries": rule },
};
