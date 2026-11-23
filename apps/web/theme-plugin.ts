import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

import { themeCss } from "./src/theme.ts";

const MARKER = "/* @sigil-theme */";

/** Replaces the marker in styles.css with the colours derived from palette.ts. */
export function sigilTheme(): Plugin {
  return {
    name: "sigil-theme",
    enforce: "pre",
    buildStart() {
      this.addWatchFile(
        fileURLToPath(new URL("../../packages/ui/src/tokens/themes/palette.ts", import.meta.url)),
      );
    },
    transform(code, id) {
      if (!id.split("?")[0]?.endsWith("/styles.css") || !code.includes(MARKER)) return null;
      return code.replace(MARKER, themeCss());
    },
  };
}
