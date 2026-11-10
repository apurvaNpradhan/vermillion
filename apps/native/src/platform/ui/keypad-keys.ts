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
