import { marked, type Token, type Tokens } from "marked";

/** A stretch of text with one style. Newlines inside `text` are the block breaks. */
export type MarkdownRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  /** The link target, or null. */
  href: string | null;
};

type Style = Omit<MarkdownRun, "text">;
const PLAIN: Style = { bold: false, italic: false, strike: false, code: false, href: null };

/** Only these links open: a Markdown link must never launch another app's scheme. */
const SAFE_LINK = /^(https?:|mailto:)/i;

function sameStyle(a: Style, b: Style) {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.strike === b.strike &&
    a.code === b.code &&
    a.href === b.href
  );
}

function push(out: MarkdownRun[], text: string, style: Style) {
  if (text === "") return;
  const last = out.at(-1);
  if (last && sameStyle(last, style)) {
    last.text += text;
    return;
  }
  out.push({ text, ...style });
}

/** The tokens nested inside one, for the kinds that have them. */
function nested(token: Token): Token[] | undefined {
  return "tokens" in token ? token.tokens : undefined;
}

function inline(tokens: Token[] | undefined, style: Style, out: MarkdownRun[]) {
  for (const token of tokens ?? []) {
    switch (token.type) {
      case "strong":
        inline(token.tokens, { ...style, bold: true }, out);
        break;
      case "em":
        inline(token.tokens, { ...style, italic: true }, out);
        break;
      case "del":
        inline(token.tokens, { ...style, strike: true }, out);
        break;
      case "codespan":
        push(out, token.text, { ...style, code: true });
        break;
      case "link":
        inline(
          token.tokens,
          { ...style, href: SAFE_LINK.test(token.href) ? token.href : null },
          out,
        );
        break;
      case "image":
        push(out, token.text, style);
        break;
      case "br":
        push(out, "\n", style);
        break;
      case "text":
      case "escape":
        if (token.type === "text" && token.tokens) inline(token.tokens, style, out);
        else push(out, token.text, style);
        break;
      default:
        push(out, token.raw, style);
    }
  }
}

function isList(token: Token): token is Tokens.List {
  return token.type === "list";
}

function list(token: Tokens.List, depth: number, out: MarkdownRun[]) {
  const start = token.start === "" ? 1 : token.start;
  token.items.forEach((item, index) => {
    if (index > 0) push(out, "\n", PLAIN);
    const marker = token.ordered ? `${start + index}.` : "•";
    push(out, `${"    ".repeat(depth)}${marker} `, PLAIN);
    item.tokens.forEach((child, childIndex) => {
      if (isList(child)) {
        push(out, "\n", PLAIN);
        list(child, depth + 1, out);
      } else {
        if (childIndex > 0) push(out, "\n", PLAIN);
        inline(nested(child) ?? [child], PLAIN, out);
      }
    });
  });
}

function block(token: Token, out: MarkdownRun[]) {
  switch (token.type) {
    case "space":
      return;
    case "heading":
      inline(token.tokens, { ...PLAIN, bold: true }, out);
      return;
    case "list":
      if (isList(token)) list(token, 0, out);
      return;
    case "blockquote":
      (token.tokens ?? []).forEach((child, index) => {
        if (index > 0) push(out, "\n", PLAIN);
        block(child, out);
      });
      return;
    case "code":
      push(out, token.text, { ...PLAIN, code: true });
      return;
    case "hr":
      push(out, "———", PLAIN);
      return;
    case "paragraph":
    case "text":
      inline(nested(token) ?? [token], PLAIN, out);
      return;
    default:
      push(out, token.raw.trim(), PLAIN);
  }
}

/**
 * Turns Markdown into styled runs that one nested `Text` can show (so the line clamp of
 * "More" works): headings are bold, lists are bulleted lines, blocks are separated by a blank
 * line, and anything beyond that (tables, HTML) reads as its source text.
 */
export function markdownRuns(markdown: string): MarkdownRun[] {
  const out: MarkdownRun[] = [];
  let first = true;
  for (const token of marked.lexer(markdown)) {
    if (token.type === "space") continue;
    if (!first) push(out, "\n\n", PLAIN);
    first = false;
    block(token, out);
  }
  return out;
}

/** Longer than the collapsed height, so "More" should be offered. */
export function isLongMarkdown(runs: readonly MarkdownRun[], lines = 4, perLine = 48): boolean {
  const text = runs.map((run) => run.text).join("");
  const rows = text
    .split("\n")
    .reduce((sum, row) => sum + Math.max(1, Math.ceil(row.length / perLine)), 0);
  return rows > lines;
}
