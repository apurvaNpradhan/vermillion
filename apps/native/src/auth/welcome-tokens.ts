export type WelcomeToken = { kind: "word"; text: string } | { kind: "icon"; name: string };

/**
 * Splits the welcome headline into words and icon slots. Translations mark a slot with a
 * self-closing tag such as `<sync/>`, so each language places the icons where they read well.
 * Punctuation stuck to a tag (`<fork/>,`) stays with the word after it.
 */
export function welcomeTokens(text: string): WelcomeToken[] {
  const tokens: WelcomeToken[] = [];
  for (const part of text.split(/(<[a-z]+\/>)/)) {
    const tag = /^<([a-z]+)\/>$/.exec(part);
    if (tag?.[1]) {
      tokens.push({ kind: "icon", name: tag[1] });
      continue;
    }
    for (const word of part.split(/\s+/)) {
      if (word) tokens.push({ kind: "word", text: word });
    }
  }
  return tokens;
}
