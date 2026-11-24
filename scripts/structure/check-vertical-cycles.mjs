// Fails on import cycles between the verticals of the native app, and on any module-level call
// of something imported from another vertical.
//
// Why: Metro evaluates modules in import order. When two verticals import each other, one of the
// two `index.ts` files is still half evaluated when the other one runs, so a binding read at
// module level (a call at the top of a file) is `undefined`. That crashed the release app at
// launch (`body` and `session`). Type checks and tests do not catch it: types are erased and
// tests load a different entry order.
//
// 1. Cycles. The graph has one node per top-level folder of `apps/native/src` other than
//    `platform`, and an edge for every runtime import of another vertical (`import type` and
//    test files are ignored; a lazy `import()` counts, because it still couples the two). A cycle
//    fails unless one of its edges is on the allowlist below. Prefer breaking the cycle: move the
//    shared piece to `platform`, or invert the dependency.
// 2. Module-level calls. A call that runs while the file is being evaluated (outside every
//    function) of a binding imported from another vertical always fails. There is no allowlist:
//    wrap it in a function and call it on first use.
//
// The scan is textual (no parser dependency) and relies on the repo's formatting: a top-level
// statement starts in column 0. See .agents/verticals.md.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";

const TREE = "apps/native/src";
const SHARED = new Set(["platform"]);

/**
 * Edges that are allowed to close a cycle, as `"from -> to": "reason"`. The edge is left out of
 * the graph, so every cycle through it passes. An entry whose edge no longer exists fails the
 * check: delete it.
 */
const ALLOWED_EDGES = new Map(
  Object.entries({
    "training -> session":
      "Train and Home start Sessions and show the last one, while session reads plans in 17 files; splitting them needs its own change.",
  }),
);

const SOURCE = /\.(?:tsx?|mts|mjs|js)$/u;
const TEST = /(?:\.test\.(?:tsx?|mts|mjs|js)$|\/__tests__\/|\/test-support\/)/u;

const root = resolve(import.meta.dirname, "../..");

/**
 * Two copies of the source with the same length and line breaks: `code` has comments blanked,
 * `bare` has comments and the contents of string, template and regex literals blanked.
 */
export function strip(source) {
  const code = [...source];
  const bare = [...source];
  const blank = (index, both) => {
    if (source[index] === "\n") return;
    bare[index] = " ";
    if (both) code[index] = " ";
  };
  // Each entry is the brace depth at which a template's `${` was opened.
  const templates = [];
  let depth = 0;
  let previous = "";
  let index = 0;

  const readTemplate = () => {
    while (index < source.length) {
      const char = source[index];
      if (char === "\\") {
        blank(index);
        blank(index + 1);
        index += 2;
      } else if (char === "`") {
        index += 1;
        return;
      } else if (char === "$" && source[index + 1] === "{") {
        templates.push(depth);
        depth += 1;
        index += 2;
        return;
      } else {
        blank(index);
        index += 1;
      }
    }
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") blank(index++, true);
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      while (index < stop) blank(index++, true);
    } else if (char === '"' || char === "'") {
      index += 1;
      while (index < source.length && source[index] !== char && source[index] !== "\n") {
        if (source[index] === "\\") blank(index++);
        blank(index++);
      }
      index += 1;
      previous = char;
    } else if (char === "`") {
      index += 1;
      readTemplate();
      previous = "`";
    } else if (char === "/" && /[(,=:[!&|?{};]|^$/u.test(previous)) {
      // A regular expression literal: a slash where an operand is expected.
      index += 1;
      let inClass = false;
      while (index < source.length && source[index] !== "\n") {
        const current = source[index];
        if (current === "\\") blank(index++);
        else if (current === "[") inClass = true;
        else if (current === "]") inClass = false;
        else if (current === "/" && !inClass) break;
        blank(index++);
      }
      index += 1;
      previous = "/";
    } else {
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (templates.length > 0 && templates.at(-1) === depth) {
          templates.pop();
          index += 1;
          readTemplate();
          previous = "`";
          continue;
        }
      }
      if (!/\s/u.test(char)) previous = char;
      index += 1;
    }
  }
  return { code: code.join(""), bare: bare.join("") };
}

const IMPORT =
  /(?<![.\w$])(?<keyword>import|export)\s+(?<clause>(?:type\s+)?[\w$\s{},*]*?)\s*from\s*["'](?<from>[^"'\n]+)["']/gu;
const BARE_IMPORT = /(?<![.\w$])import\s*["'](?<from>[^"'\n]+)["']/gu;
const LAZY_IMPORT = /(?<![.\w$])(?:import|require)\s*\(\s*["'](?<from>[^"'\n]+)["']\s*\)/gu;

/** Runtime imports of a file: `{ from, names }`, where `names` are the local bindings. */
export function runtimeImports(code) {
  const found = [];
  for (const match of code.matchAll(IMPORT)) {
    const { keyword, clause, from } = match.groups;
    if (/^type\b/u.test(clause)) continue;
    const names = [];
    const braces = /\{(?<inner>[^}]*)\}/u.exec(clause);
    const outside = clause.replace(/\{[^}]*\}/u, "");
    let runtime = false;
    for (const part of outside.split(",")) {
      const name = part.trim();
      if (name === "") continue;
      runtime = true;
      names.push(name.replace(/^\*\s*as\s+/u, ""));
    }
    for (const part of braces?.groups.inner.split(",") ?? []) {
      const specifier = part.trim();
      if (specifier === "" || /^type\s/u.test(specifier)) continue;
      runtime = true;
      names.push(specifier.split(/\s+as\s+/u).at(-1));
    }
    // `import {} from` and a clause of only `type` specifiers load nothing at runtime.
    if (!runtime) continue;
    // A re-export binds nothing in this file.
    found.push({ from, names: keyword === "import" ? names.filter((name) => name !== "*") : [] });
  }
  for (const pattern of [BARE_IMPORT, LAZY_IMPORT])
    for (const match of code.matchAll(pattern)) found.push({ from: match.groups.from, names: [] });
  return found;
}

/** The vertical a specifier points at, from a file of the tree; null for anything else. */
function verticalOf(specifier, file) {
  let target;
  if (specifier.startsWith("@/")) target = specifier.slice(2);
  else if (specifier.startsWith(".")) {
    const joined = posix.join(dirname(file), specifier);
    if (!joined.startsWith(`${TREE}/`)) return null;
    target = joined.slice(TREE.length + 1);
  } else return null;
  const [first] = target.split("/");
  return first === "" || SOURCE.test(first) ? null : first;
}

const CONTROL = new Set(["if", "for", "while", "switch", "catch", "with"]);
const DECLARATION =
  /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:import\b|type\b|interface\b|enum\b|namespace\b|abstract\s+class\b|class\b|(?:async\s+)?function\b)|^export\s*(?:\{|\*)/u;

/** Index just past the bracket that closes the one at `open`. */
function closing(text, open) {
  const pairs = { "(": ")", "{": "}", "[": "]" };
  const opener = text[open];
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === opener) depth += 1;
    else if (text[index] === pairs[opener] && --depth === 0) return index + 1;
  }
  return text.length;
}

/** Blanks every function body of a statement, leaving what runs when the module loads. */
export function withoutFunctions(statement) {
  const out = [...statement];
  const blank = (from, to) => {
    for (let index = from; index < to; index += 1) if (out[index] !== "\n") out[index] = " ";
  };
  const parens = [];
  let index = 0;
  while (index < statement.length) {
    const rest = statement.slice(index);
    if (statement[index] === "(") {
      parens.push(index);
      index += 1;
    } else if (statement[index] === ")") {
      const open = parens.pop() ?? 0;
      // `name(args) {` or `name(args): Type {` is a method or function body, unless the
      // parentheses belong to a control statement.
      const body = /^\)\s*(?::\s*[\w$.<>[\],\s|&]+?)?\s*\{/u.exec(rest);
      const word = /(?<word>[\w$]+)\s*$/u.exec(statement.slice(0, open))?.groups.word;
      if (body && !CONTROL.has(word)) {
        const brace = index + body[0].length - 1;
        const end = closing(statement, brace);
        blank(brace, end);
        index = end;
      } else index += 1;
    } else if (rest.startsWith("=>")) {
      const start = index + 2;
      const first = start + /^\s*/u.exec(statement.slice(start))[0].length;
      let end;
      if (statement[first] === "{") end = closing(statement, first);
      else {
        // An expression body runs to the next `,` or `;` or to the bracket that encloses it.
        let depth = 0;
        end = first;
        for (; end < statement.length; end += 1) {
          const char = statement[end];
          if ("({[".includes(char)) depth += 1;
          else if (")}]".includes(char)) {
            if (depth === 0) break;
            depth -= 1;
          } else if ((char === "," || char === ";") && depth === 0) break;
        }
      }
      blank(first, end);
      index = end;
    } else index += 1;
  }
  return out.join("");
}

/** Top-level statements of a file, as `{ text, offset }` slices of `bare`. */
function statements(bare) {
  const starts = [];
  let offset = 0;
  for (const line of bare.split("\n")) {
    // A line that opens with a closing bracket continues the statement above it.
    if (/^[^\s)}\]]/u.test(line)) starts.push(offset);
    offset += line.length + 1;
  }
  return starts.map((start, position) => ({
    offset: start,
    text: bare.slice(start, starts[position + 1] ?? bare.length),
  }));
}

const escape = (name) => name.replaceAll("$", "\\$");

/** Module-level calls of `names` in a file: `{ name, line }`. */
export function moduleLevelCalls(bare, names) {
  if (names.length === 0) return [];
  // `name(`, `name.member(`, `name<T>(`, a tagged template, and `new Name`.
  const call = new RegExp(
    `(?<![.\\w$])(?:new\\s+)?(?<name>${names.map(escape).join("|")})(?![\\w$])` +
      "(?:\\s*\\??\\.\\s*[\\w$]+)*\\s*(?:<[^<>()]*>\\s*)?[(`]|" +
      `(?<![.\\w$])new\\s+(?<constructed>${names.map(escape).join("|")})(?![\\w$])`,
    "gu",
  );
  const calls = [];
  for (const { text, offset } of statements(bare)) {
    if (DECLARATION.test(text)) continue;
    for (const match of withoutFunctions(text).matchAll(call)) {
      const line = bare.slice(0, offset + match.index).split("\n").length;
      calls.push({ name: match.groups.name ?? match.groups.constructed, line });
    }
  }
  return calls;
}

/** Simple cycles of a graph given as Map<node, Set<node>>, each starting at its smallest node. */
export function findCycles(graph) {
  const cycles = [];
  const nodes = [...graph.keys()].toSorted();
  for (const start of nodes) {
    const path = [start];
    const visit = (node) => {
      for (const next of [...(graph.get(node) ?? [])].toSorted()) {
        if (next === start) cycles.push([...path]);
        // Only walk nodes after `start`, so every cycle is reported once.
        else if (next > start && !path.includes(next)) {
          path.push(next);
          visit(next);
          path.pop();
        }
      }
    };
    visit(start);
  }
  return cycles;
}

function main() {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", TREE],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter((file) => SOURCE.test(file) && !TEST.test(file) && existsSync(resolve(root, file)));

  /** "from -> to" => files of `from` that import `to`. */
  const edges = new Map();
  const callFailures = [];

  for (const file of files) {
    const [vertical, ...tail] = file.slice(TREE.length + 1).split("/");
    if (tail.length === 0 || SHARED.has(vertical)) continue;
    const { code, bare } = strip(readFileSync(resolve(root, file), "utf8"));
    const foreign = new Map();
    for (const { from, names } of runtimeImports(code)) {
      const target = verticalOf(from, file);
      if (target === null || target === vertical || SHARED.has(target)) continue;
      const key = `${vertical} -> ${target}`;
      edges.set(key, [...(edges.get(key) ?? []), file]);
      for (const name of names) foreign.set(name, target);
    }
    for (const { name, line } of moduleLevelCalls(bare, [...foreign.keys()]))
      callFailures.push(
        `${file}:${line}: module-level call of \`${name}\` from the \`${foreign.get(name)}\` vertical. ` +
          "Call it inside a function (on first use), not while the file loads.",
      );
  }

  const failures = [...callFailures];
  for (const key of ALLOWED_EDGES.keys())
    if (!edges.has(key))
      failures.push(`Allowlisted edge "${key}" no longer exists: remove it from ALLOWED_EDGES.`);

  const graph = new Map();
  for (const key of edges.keys()) {
    if (ALLOWED_EDGES.has(key)) continue;
    const [from, to] = key.split(" -> ");
    graph.set(from, (graph.get(from) ?? new Set()).add(to));
  }
  for (const cycle of findCycles(graph)) {
    const lines = cycle.map((from, position) => {
      const to = cycle[(position + 1) % cycle.length];
      const importers = edges.get(`${from} -> ${to}`);
      const shown = importers.slice(0, 3).join(", ");
      const more = importers.length > 3 ? ` (+${importers.length - 3} more)` : "";
      return `    ${from} -> ${to}: ${shown}${more}`;
    });
    failures.push(
      `Import cycle between verticals: ${[...cycle, cycle[0]].join(" -> ")}\n${lines.join("\n")}`,
    );
  }

  for (const failure of failures) console.error(failure);
  if (failures.length > 0) {
    console.error(
      `\n${failures.length} problem(s). Break a cycle by moving the shared piece to platform or ` +
        "inverting the dependency; see .agents/verticals.md.",
    );
    process.exit(1);
  }
}

if (import.meta.main) main();
