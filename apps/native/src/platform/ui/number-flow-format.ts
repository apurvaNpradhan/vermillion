export type NumberFlowToken =
  | { kind: "digit"; digit: number; key: string }
  | { kind: "separator"; char: string; key: string };

export type NumberFlowFormat = {
  /** Digits after the decimal separator. Omit to show the number as it is. */
  decimals?: number;
  decimalSeparator?: string;
  /** Thousands separator; none when omitted. */
  groupSeparator?: string;
};

/**
 * Splits a number into the glyphs NumberFlow draws. Keys count from the decimal point outwards
 * ("i0" is the ones place, "i1" the tens, "d0" the first decimal), so when 99 becomes 100 the
 * existing columns keep their identity and only the new leading one mounts. Non-finite input
 * reads as 0. Large magnitudes avoid exponent notation by formatting through `toFixed`.
 */
export function tokenizeNumber(value: number, format: NumberFlowFormat = {}): NumberFlowToken[] {
  const { decimals, decimalSeparator = ".", groupSeparator } = format;
  const safe = Number.isFinite(value) ? value : 0;
  const places =
    decimals === undefined ? undecimalPlaces(safe) : Math.min(Math.max(decimals, 0), 20);
  const fixed = Math.abs(safe).toFixed(places);
  const [integer = "0", fraction = ""] = fixed.split(".");
  // A value that rounds to zero shows no sign ("-0.0" would read as a loss).
  const negative = safe < 0 && /[1-9]/.test(fixed);

  const tokens: NumberFlowToken[] = [];
  if (negative) tokens.push({ kind: "separator", char: "−", key: "sign" });
  [...integer].forEach((char, index) => {
    const fromRight = integer.length - 1 - index;
    tokens.push({ kind: "digit", digit: Number(char), key: `i${fromRight}` });
    if (groupSeparator && fromRight > 0 && fromRight % 3 === 0) {
      tokens.push({ kind: "separator", char: groupSeparator, key: `g${fromRight}` });
    }
  });
  if (fraction.length > 0) {
    tokens.push({ kind: "separator", char: decimalSeparator, key: "point" });
    [...fraction].forEach((char, index) => {
      tokens.push({ kind: "digit", digit: Number(char), key: `d${index}` });
    });
  }
  return tokens;
}

/** The text a screen reader should speak: the same glyphs, joined. */
export function tokensToText(tokens: NumberFlowToken[]): string {
  return tokens
    .map((token) => (token.kind === "digit" ? String(token.digit) : token.char))
    .join("");
}

function undecimalPlaces(value: number): number {
  const text = String(Math.abs(value));
  if (text.includes("e")) return 0;
  return text.split(".")[1]?.length ?? 0;
}
