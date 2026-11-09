export type LegalPart = { kind: "text"; text: string } | { kind: "terms" | "privacy" };

/**
 * Cuts a translated sentence such as "By continuing you agree to our {terms} and {privacy}." into
 * plain text and the two link slots, so each language keeps its own word order.
 */
export function splitLegal(sentence: string): LegalPart[] {
  return sentence
    .split(/(\{terms\}|\{privacy\})/)
    .filter((piece) => piece.length > 0)
    .map((piece): LegalPart => {
      if (piece === "{terms}") return { kind: "terms" };
      if (piece === "{privacy}") return { kind: "privacy" };
      return { kind: "text", text: piece };
    });
}
