/**
 * Generates the website's brand assets from the sources in docs/design/sigil:
 * favicons, app icons and the social preview image.
 *
 * Run by hand when a source changes: `pnpm --filter web brand-assets`. The outputs are committed.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { site } from "../src/content/en.ts";
import { webColors } from "../src/theme.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const design = path.join(root, "docs/design/sigil");
const pub = path.join(here, "../public");

// Brand images are dark: the dark canvas, the dark ink and the accent, all from palette.ts.
const dark = webColors("dark");
const CANVAS = dark.canvas;
const INK = dark.ink;
const ACCENT = dark.accent;

/** The mark (A) in ivory on a rounded ink tile. `scale` is the mark's share of the tile. */
async function markTile(size: number, scale: number, radius: number) {
  const mark = await readFile(path.join(design, "mark.svg"), "utf8");
  const inner = mark.replace(/<svg[^>]*>/, "").replace("</svg>", "");
  const m = size * scale;
  const offset = (size - m) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${radius}" fill="${CANVAS}"/>
    <svg x="${offset}" y="${offset}" width="${m}" height="${m}" viewBox="0 0 48 48" color="${INK}" fill="currentColor">${inner}</svg>
  </svg>`;
  return sharp(Buffer.from(svg)).png();
}

/** Packs PNG images into an .ico container (PNG-compressed entries, supported since Vista). */
function ico(images: { size: number; png: Buffer }[]) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  for (const [index, { size, png }] of images.entries()) {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  }
  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

/** The web app manifest, from app.config.ts and the site copy so it never drifts. */
async function manifest() {
  const icon = (size: number, purpose: string, file: string) => ({
    src: `/icons/${file}-${size}.png`,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose,
  });
  const body = {
    name: site.title,
    short_name: site.name,
    description: `${site.tagline} ${site.description}`,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "browser",
    background_color: CANVAS,
    theme_color: CANVAS,
    icons: [
      icon(192, "any", "icon"),
      icon(512, "any", "icon"),
      icon(192, "maskable", "icon-maskable"),
      icon(512, "maskable", "icon-maskable"),
    ],
  };
  await writeFile(path.join(pub, "manifest.webmanifest"), `${JSON.stringify(body, null, 2)}\n`);
}

async function main() {
  await manifest();
  await mkdir(path.join(pub, "brand"), { recursive: true });
  await mkdir(path.join(pub, "favicon"), { recursive: true });
  await mkdir(path.join(pub, "icons"), { recursive: true });

  const mark = await readFile(path.join(design, "mark.svg"), "utf8");
  await writeFile(path.join(pub, "brand/mark.svg"), mark);
  await writeFile(
    path.join(pub, "brand/mark-ember.svg"),
    (await readFile(path.join(design, "mark-ember.svg"), "utf8"))
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/#E04A2F/gi, ACCENT),
  );
  const markPaths = mark.replace(/<svg[^>]*>/, "").replace("</svg>", "");
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${CANVAS}"/><svg x="7" y="7" width="50" height="50" viewBox="0 0 48 48" fill="${INK}">${markPaths}</svg></svg>\n`;
  await writeFile(path.join(pub, "favicon.svg"), faviconSvg);

  const favicons = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      png: await (await markTile(size, 0.86, size / 5)).toBuffer(),
    })),
  );
  for (const { size, png } of favicons)
    await writeFile(path.join(pub, `favicon/favicon-${size}.png`), png);
  await writeFile(path.join(pub, "favicon.ico"), ico(favicons));

  await (await markTile(180, 0.62, 0)).toFile(path.join(pub, "apple-touch-icon.png"));
  for (const size of [192, 512]) {
    await (await markTile(size, 0.62, size * 0.2)).toFile(path.join(pub, `icons/icon-${size}.png`));
    await (await markTile(size, 0.5, 0)).toFile(path.join(pub, `icons/icon-maskable-${size}.png`));
  }

  // Social preview: black ground, the brand mark with its accent dot, and the wordmark.
  const brandMark = (await readFile(path.join(design, "mark-ember.svg"), "utf8"))
    .replace('fill="currentColor"', `fill="${INK}"`)
    .replace(/#E04A2F/gi, ACCENT)
    .replace("<svg ", '<svg width="260" height="260" ');
  const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="260"><text x="0" y="205" font-family="Arial, sans-serif" font-weight="700" font-size="220" letter-spacing="-9" fill="${INK}">${site.name.toUpperCase()}</text></svg>`;
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: CANVAS } })
    .composite([
      { input: Buffer.from(brandMark), left: 140, top: 185 },
      { input: Buffer.from(wordmark), left: 440, top: 185 },
    ])
    .png()
    .toFile(path.join(pub, "brand/og.png"));
}

await main();
