// Grades the Sigil hero photograph into a clean ivory-on-ink duotone: greyscale, black and white
// points pulled in, a gentle S-curve, a little local contrast, then mapped between the ground
// (#0B0A09) and ivory (#ECE6D8). No dither, no halftone, no baked grain.
// Source: docs/design/sigil/source/atlas-prisoner-jbu-02.jpg (credit: CREDITS.md).
// Usage: node scripts/brand/grade-hero.mjs [--width 1080] [--out apps/native/assets/images/sigil-atlas.jpg]
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const root = new URL("../../", import.meta.url);
const input = fileURLToPath(new URL("docs/design/sigil/source/atlas-prisoner-jbu-02.jpg", root));
const width = Number(option("width", "1080"));
const output = fileURLToPath(
  new URL(option("out", "apps/native/assets/images/sigil-atlas.jpg"), root),
);

const GROUND = [0x0b, 0x0a, 0x09];
const IVORY = [0xec, 0xe6, 0xd8];
/** Values at or below the black point land on the ground; at or above the white point on ivory. */
const BLACK_POINT = 0.07;
const WHITE_POINT = 0.96;
/** 0 keeps the tonal curve linear, 1 is a full smoothstep S-curve. */
const S_CURVE = 0.55;

const smoothstep = (t) => t * t * (3 - 2 * t);
const curve = (value) => {
  const t = Math.min(1, Math.max(0, (value - BLACK_POINT) / (WHITE_POINT - BLACK_POINT)));
  return t + (smoothstep(t) - t) * S_CURVE;
};

const { data, info } = await sharp(input)
  .resize({ width })
  .greyscale()
  .normalise({ lower: 1, upper: 99.5 })
  // A little local contrast brings out the chisel marks.
  .clahe({ width: 48, height: 72, maxSlope: 2 })
  .raw()
  .toBuffer({ resolveWithObject: true });

const rgb = Buffer.alloc(info.width * info.height * 3);
for (let i = 0; i < info.width * info.height; i++) {
  const t = curve((data[i] ?? 0) / 255);
  for (let channel = 0; channel < 3; channel++) {
    rgb[i * 3 + channel] = Math.round(GROUND[channel] + (IVORY[channel] - GROUND[channel]) * t);
  }
}

await sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } })
  .jpeg({ quality: 76, mozjpeg: true, chromaSubsampling: "4:4:4" })
  .toFile(output);
console.log(`wrote ${output} (${info.width}x${info.height})`);
