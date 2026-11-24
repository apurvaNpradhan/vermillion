/** A link without its scheme, short enough for the Share card's footer: `sigil.example/p/ABC234`. */
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/** The code as people read it aloud: `K7Q M2X`. */
export function spacedCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
