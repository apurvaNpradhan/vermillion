// Regenerates the native app's brand images from docs/design/sigil/mark.svg (the Sigil mark) plus
// the Acid dot: app icon, Android adaptive icon layers, splash (dark and light), notification icon.
// Run `pnpm brand:assets`. Palette: AMOLED black, pure white, one Acid accent
// (docs/design/redesign-2026-11/SPEC.md). Android legacy and round launcher icons per density are
// derived from icon.png and the adaptive layers by `expo prebuild`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../../", import.meta.url);
const out = (name) => fileURLToPath(new URL(`apps/native/assets/images/${name}`, root));

const BLACK = "#000000";
const WHITE = "#FFFFFF";
const ACID = "#A3FF12";

/** The mark's own box in its 48-unit viewBox: mark A, and A2 with its Acid dot. */
const BOX_A = { x: 10.8, y: 5, w: 26.4, h: 37.5 };
const BOX_A2 = { x: 10.8, y: 5, w: 29.3, h: 37.6 };

const paths = (file) =>
  [
    ...readFileSync(new URL(`docs/design/sigil/${file}`, root), "utf8").matchAll(
      /<path d="([^"]+)"/g,
    ),
  ].map((match) => match[1]);
const markPaths = paths("mark.svg");

/** An SVG of the mark centred on a square canvas, `height` px tall (`dot` adds the Acid dot). */
function markSvg({ size, height, ink, dot = false, dotInk = ACID, background = null }) {
  const box = dot ? BOX_A2 : BOX_A;
  const scale = height / box.h;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const group = markPaths.map((d) => `<path d="${d}"/>`).join("");
  const accent = dot ? `<circle cx="36.5" cy="37" r="3.6" fill="${dotInk}"/>` : "";
  const ground = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${ground}<g transform="translate(${size / 2} ${size / 2}) scale(${scale}) translate(${-cx} ${-cy})"><g fill="${ink}">${group}</g>${accent}</g></svg>`,
  );
}

async function png(name, svg, size) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out(name));
  console.log(`wrote ${name} (${size}px)`);
}

// App icon: black with the white mark and Acid dot at about 58% of the icon.
await png(
  "icon.png",
  markSvg({ size: 1024, height: 594, ink: WHITE, dot: true, background: BLACK }),
  1024,
);

// Android adaptive icon (108dp layers, 1024px): mark and dot sit inside the 66dp safe circle. The
// #000 background is set in app.config.ts; the monochrome layer is the same silhouette in white.
const SAFE_RADIUS = ((66 / 108) * 1024) / 2;
const halfDiagonal = Math.hypot(BOX_A2.w / 2, BOX_A2.h / 2);
const adaptiveHeight = Math.round(((SAFE_RADIUS * 0.94) / halfDiagonal) * BOX_A2.h);
await png(
  "android-icon-foreground.png",
  markSvg({ size: 1024, height: adaptiveHeight, ink: WHITE, dot: true }),
  1024,
);
await png(
  "android-icon-monochrome.png",
  markSvg({ size: 1024, height: adaptiveHeight, ink: WHITE, dot: true, dotInk: WHITE }),
  1024,
);

// Splash: the mark centred; the background colour is set in app.config.ts. Dark is white on
// black; light is black on white.
await png("splash-icon.png", markSvg({ size: 1024, height: 512, ink: WHITE, dot: true }), 1024);
await png(
  "splash-icon-light.png",
  markSvg({ size: 1024, height: 512, ink: BLACK, dot: true }),
  1024,
);

// Notification icon: the mark, white on transparent. Android tints it and the Expo plugin resizes
// it to every density; the mark fills the frame so its stem survives at mdpi (24px).
await png("notification-icon.png", markSvg({ size: 96, height: 90, ink: WHITE }), 96);
