export const KEYPAD_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** A key that edits the number being typed. */
export type KeypadKey = (typeof KEYPAD_DIGITS)[number] | "." | "backspace";

/** A key that moves on: to the next cell, or away. */
export type KeypadNav = "next" | "done";

/** Maps a hardware keyboard key name to a keypad key, or null for keys the keypad ignores. */
export function keypadKeyOf(name: string): KeypadKey | null {
  const digit = KEYPAD_DIGITS.find((candidate) => candidate === name);
  if (digit !== undefined) return digit;
  if (name === "." || name === ",") return ".";
  if (name === "Backspace") return "backspace";
  return null;
}

/** Tab moves to the next cell, Enter finishes. */
export function keypadNavOf(name: string): KeypadNav | null {
  if (name === "Tab") return "next";
  if (name === "Enter") return "done";
  return null;
}

/**
 * The keys typed into the hidden input, as the text it received: every digit and point (a decimal
 * comma becomes a point) in order; anything else is dropped. A point is dropped when the cell
 * takes none. This is the only path printable characters take (the system keyboard, a hardware
 * keyboard and paste all end up here), so a digit is never counted twice.
 */
export function keypadKeysOfText(text: string, allowPoint: boolean): KeypadKey[] {
  const keys: KeypadKey[] = [];
  for (const char of text) {
    const key = keypadKeyOf(char);
    if (key !== null && key !== "backspace" && (key !== "." || allowPoint)) keys.push(key);
  }
  return keys;
}

export type KeypadPress = { edit: KeypadKey | null; nav: KeypadNav | null };

/**
 * What a key press event means. Printable characters are left to the text path (Android sends
 * both events for them); only Backspace, which has no text on an empty input, edits here.
 */
export function keypadPressOf(name: string): KeypadPress {
  return { edit: name === "Backspace" ? "backspace" : null, nav: keypadNavOf(name) };
}
