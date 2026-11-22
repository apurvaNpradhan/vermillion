// Regenerates the native app's brand images from docs/design/sigil/mark.svg (mark A) and
// mark-ember.svg (mark A2): app icon, Android adaptive icon layers, splash, notification icon and
// favicon. Run `pnpm brand:assets`. Colours and geometry follow docs/design/sigil/SPEC.md.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../../", import.meta.url);
const out = (name) => fileURLToPath(new URL(`apps/native/assets/images/${name}`, root));

const GROUND = "#0B0A09";
const IVORY = "#ECE6D8";
const EMBER = "#E04A2F";

/** The mark's own box in its 48-unit viewBox: mark A, and A2 with its ember dot. */
const BOX_A = { x: 10.8, y: 5, w: 26.4, h: 37.5 };
const BOX_A2 = { x: 10.8, y: 5, w: 29.3, h: 37.6 };

const paths = (file) =>
  [
    ...readFileSync(new URL(`docs/design/sigil/${file}`, root), "utf8").matchAll(
      /<path d="([^"]+)"/g,
    ),
  ].map((match) => match[1]);
const markPaths = paths("mark.svg");

/** An SVG of the mark centred on a square canvas, `height` px tall (`dot` adds the A2 ember dot). */
function markSvg({ size, height, ink, dot = false, background = null }) {
  const box = dot ? BOX_A2 : BOX_A;
  const scale = height / box.h;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const group = markPaths.map((d) => `<path d="${d}"/>`).join("");
  const ember = dot ? `<circle cx="36.5" cy="37" r="3.6" fill="${EMBER}"/>` : "";
  const ground = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${ground}<g transform="translate(${size / 2} ${size / 2}) scale(${scale}) translate(${-cx} ${-cy})"><g fill="${ink}">${group}</g>${ember}</g></svg>`,
  );
}

async function png(name, svg, size) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out(name));
  console.log(`wrote ${name} (${size}px)`);
}

// App icon: ground with mark A at about 58% of the icon, optically centred.
await png("icon.png", markSvg({ size: 1024, height: 594, ink: IVORY, background: GROUND }), 1024);

// Android adaptive icon (108dp layers, 1024px): the mark sits inside the 66dp safe circle. The
// background colour (the ground) is set in app.config.ts; the monochrome layer is mark A.
const SAFE_RADIUS = ((66 / 108) * 1024) / 2;
const halfDiagonal = Math.hypot(BOX_A.w / 2, BOX_A.h / 2);
const adaptiveHeight = Math.round(((SAFE_RADIUS * 0.94) / halfDiagonal) * BOX_A.h);
await png(
  "android-icon-foreground.png",
  markSvg({ size: 1024, height: adaptiveHeight, ink: IVORY }),
  1024,
);
await png(
  "android-icon-monochrome.png",
  markSvg({ size: 1024, height: adaptiveHeight, ink: "#FFFFFF" }),
  1024,
);

// Splash: mark A2 centred; the ground is the splash background colour in app.config.ts.
await png("splash-icon.png", markSvg({ size: 1024, height: 512, ink: IVORY, dot: true }), 1024);

// Notification icon: mark A, white on transparent. Android tints it and the Expo plugin resizes
// it to every density; the mark fills the frame so its stem survives at mdpi (24px).
await png("notification-icon.png", markSvg({ size: 96, height: 90, ink: "#FFFFFF" }), 96);

// Favicon.
await png("favicon.png", markSvg({ size: 128, height: 76, ink: IVORY, background: GROUND }), 128);
