/**
 * Generates the website's brand assets from the sources in docs/design/sigil:
 * the graded hero photographs, favicons, app icons and the social preview image.
 *
 * Run by hand when a source changes: `pnpm --filter web brand-assets`. The outputs are committed.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { site } from "../src/content/en.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const design = path.join(root, "docs/design/sigil");
const pub = path.join(here, "../public");

const INK = { r: 11, g: 10, b: 9 };
const IVORY = { r: 236, g: 230, b: 216 };
const EMBER = "#E04A2F";

/** Grayscale, local contrast, levels and a gentle S-curve, mapped onto ink → ivory. */
async function duotone(source: string, width: number) {
  const meta = await sharp(source).metadata();
  // The bottom ~16% of the source shows the display plinth's edge; the figure ends above it.
  const crop = { left: 0, top: 0, width: meta.width, height: Math.round(meta.height * 0.84) };
  const image = sharp(source).grayscale().extract(crop);
  const { data, info } = await image
    .resize({ width, withoutEnlargement: true })
    .clahe({ width: 160, height: 160, maxSlope: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const black = 0.09;
  const white = 0.93;
  const gamma = 1.2;
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) {
    const level = Math.min(
      1,
      Math.max(0, ((data[i * info.channels] ?? 0) / 255 - black) / (white - black)),
    );
    const toned = 0.5 - 0.5 * Math.cos(Math.PI * level ** gamma);
    out[i * 3] = Math.round(INK.r + (IVORY.r - INK.r) * toned);
    out[i * 3 + 1] = Math.round(INK.g + (IVORY.g - INK.g) * toned);
    out[i * 3 + 2] = Math.round(INK.b + (IVORY.b - INK.b) * toned);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } });
}

/** The mark (A) in ivory on a rounded ink tile. `scale` is the mark's share of the tile. */
async function markTile(size: number, scale: number, radius: number) {
  const mark = await readFile(path.join(design, "mark.svg"), "utf8");
  const inner = mark.replace(/<svg[^>]*>/, "").replace("</svg>", "");
  const m = size * scale;
  const offset = (size - m) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${radius}" fill="rgb(${INK.r},${INK.g},${INK.b})"/>
    <svg x="${offset}" y="${offset}" width="${m}" height="${m}" viewBox="0 0 48 48" color="rgb(${IVORY.r},${IVORY.g},${IVORY.b})" fill="currentColor">${inner}</svg>
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
    background_color: "#0B0A09",
    theme_color: "#0B0A09",
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
  const sourcePhoto = path.join(design, "source/atlas-prisoner-jbu-02.jpg");
  await mkdir(path.join(pub, "brand"), { recursive: true });
  await mkdir(path.join(pub, "favicon"), { recursive: true });
  await mkdir(path.join(pub, "icons"), { recursive: true });

  for (const width of [640, 1080]) {
    const graded = await duotone(sourcePhoto, width);
    await graded
      .clone()
      .webp({ quality: 82 })
      .toFile(path.join(pub, `brand/atlas-${width}.webp`));
    await graded
      .clone()
      .avif({ quality: 52 })
      .toFile(path.join(pub, `brand/atlas-${width}.avif`));
  }

  const mark = await readFile(path.join(design, "mark.svg"), "utf8");
  await writeFile(path.join(pub, "brand/mark.svg"), mark);
  await writeFile(
    path.join(pub, "brand/mark-ember.svg"),
    await readFile(path.join(design, "mark-ember.svg"), "utf8"),
  );
  const markPaths = mark.replace(/<svg[^>]*>/, "").replace("</svg>", "");
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B0A09"/><svg x="7" y="7" width="50" height="50" viewBox="0 0 48 48" fill="#ECE6D8">${markPaths}</svg></svg>\n`;
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

  // Social preview: ink ground, the graded photograph on the right, the brand mark on the left.
  const og = await duotone(sourcePhoto, 520);
  const ogPhoto = await og
    .clone()
    .resize({ height: 630, width: 520, fit: "cover", position: "top" })
    .png()
    .toBuffer();
  const brandMark = (await readFile(path.join(design, "mark-ember.svg"), "utf8"))
    .replace('fill="currentColor"', `fill="rgb(${IVORY.r},${IVORY.g},${IVORY.b})"`)
    .replace(/#E04A2F/g, EMBER)
    .replace("<svg ", '<svg width="260" height="260" ');
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: INK } })
    .composite([
      { input: ogPhoto, left: 640, top: 0 },
      { input: Buffer.from(brandMark), left: 150, top: 185 },
    ])
    .png()
    .toFile(path.join(pub, "brand/og.png"));
}

await main();
