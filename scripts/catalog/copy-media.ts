// Copies the approved new exercises' media from the source bucket into the exercise media bucket
// under `exercises/v2/` (thumbnails as WebP, videos as is, a medium image for rows without a
// video). Run:
//   pnpm catalog:media --patch <0002-expansion.json> --candidates <candidates.json> --out <dir>
//     [--dry-run] [--limit N] [--concurrency 6] [--public-base https://...] [--no-keys-file]
// Writes `<out>/media-keys.json` (id -> keys, plus failures) and `<out>/copy-media.log`.
// Idempotent: an object already at the destination (same size for videos, any non-empty object
// for converted images) is skipped, so a rerun resumes. Credentials come from the environment
// and are never written anywhere:
//   SOURCE_S3_ENDPOINT, SOURCE_S3_BUCKET, SOURCE_S3_ACCESS_KEY_ID, SOURCE_S3_SECRET_ACCESS_KEY
//   EXERCISE_MEDIA_S3_BUCKET (and optionally EXERCISE_MEDIA_S3_ENDPOINT/_ACCESS_KEY_ID/
//   _SECRET_ACCESS_KEY when the destination account differs from the source).
// Only keys under `exercises/v2/` are ever written.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { AwsClient } from "aws4fetch";
import sharp from "sharp";
import { z } from "zod";

import {
  CONTENT_TYPES,
  DEST_PREFIX,
  encodeKey,
  keysFor,
  MAX_THUMBNAIL_BYTES,
  planRow,
  THUMBNAIL_SIZE,
  videoFits,
  type MediaKeys,
  type MediaTask,
} from "./expansion/media.ts";

const CACHE_CONTROL = "public, max-age=31536000, immutable";
/** Well under the slot limit; a 180 px thumbnail is a few KB at this quality. */
const TARGET_THUMBNAIL_BYTES = 150 * 1024;

const { values } = parseArgs({
  options: {
    patch: { type: "string" },
    candidates: { type: "string" },
    out: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    limit: { type: "string" },
    concurrency: { type: "string", default: "6" },
    "public-base": { type: "string" },
  },
});
if (values.patch === undefined || values.candidates === undefined || values.out === undefined) {
  console.error("usage: copy-media.ts --patch <file> --candidates <file> --out <dir> [--dry-run]");
  process.exit(2);
}
const dryRun = values["dry-run"];
const outDir = values.out;
mkdirSync(outDir, { recursive: true });
const LOG = join(outDir, "copy-media.log");
const log = (line: string): void => {
  console.log(line);
  appendFileSync(LOG, `${line}\n`);
};

const need = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === "") {
    console.error(`missing environment variable ${name}`);
    process.exit(2);
  }
  return value;
};
const optional = (name: string, fallback: string): string => {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
};

const sourceEndpoint = need("SOURCE_S3_ENDPOINT");
const sourceKeyId = need("SOURCE_S3_ACCESS_KEY_ID");
const sourceSecret = need("SOURCE_S3_SECRET_ACCESS_KEY");
const sourceBucket = need("SOURCE_S3_BUCKET");
const destBucket = need("EXERCISE_MEDIA_S3_BUCKET");
const destEndpoint = optional("EXERCISE_MEDIA_S3_ENDPOINT", sourceEndpoint);
const client = (id: string, secret: string): AwsClient =>
  new AwsClient({ accessKeyId: id, secretAccessKey: secret, service: "s3", region: "auto" });
const sourceClient = client(sourceKeyId, sourceSecret);
const destClient = client(
  optional("EXERCISE_MEDIA_S3_ACCESS_KEY_ID", sourceKeyId),
  optional("EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY", sourceSecret),
);

const url = (endpoint: string, bucket: string, key: string): string =>
  `${endpoint}/${bucket}/${encodeKey(key)}`;

class FatalError extends Error {}

/** Size of an object, or null when it does not exist. */
async function head(
  c: AwsClient,
  endpoint: string,
  bucket: string,
  key: string,
): Promise<number | null> {
  const res = await c.fetch(url(endpoint, bucket, key), { method: "HEAD" });
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) {
    throw new FatalError(`HEAD ${bucket}/${key}: ${res.status} (no permission)`);
  }
  if (!res.ok) throw new Error(`HEAD ${bucket}/${key}: ${res.status}`);
  return Number(res.headers.get("content-length") ?? "0");
}

async function download(key: string): Promise<Buffer> {
  const res = await sourceClient.fetch(url(sourceEndpoint, sourceBucket, key));
  if (!res.ok) throw new Error(`GET ${sourceBucket}/${key}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function put(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!key.startsWith(DEST_PREFIX))
    throw new FatalError(`refusing to write outside ${DEST_PREFIX}: ${key}`);
  const res = await destClient.fetch(url(destEndpoint, destBucket, key), {
    method: "PUT",
    body: new Uint8Array(body),
    headers: {
      "content-type": contentType,
      "cache-control": CACHE_CONTROL,
      "content-length": String(body.length),
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new FatalError(`PUT ${destBucket}/${key}: ${res.status} (the token cannot write)`);
  }
  if (!res.ok) throw new Error(`PUT ${destBucket}/${key}: ${res.status}`);
}

/** The thumbnail: contained in a square of the current size on the image's own background. */
async function toThumbnail(png: Buffer): Promise<Buffer> {
  const flat = sharp(png).flatten({ background: "#ffffff" });
  const corner = await flat
    .clone()
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer();
  const background = { r: corner[0] ?? 255, g: corner[1] ?? 255, b: corner[2] ?? 255 };
  for (let quality = 80; ; quality -= 10) {
    const out = await flat
      .clone()
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: "contain", background })
      .webp({ quality })
      .toBuffer();
    if (out.length <= TARGET_THUMBNAIL_BYTES || quality <= 40) return out;
  }
}

async function toFullImage(png: Buffer): Promise<Buffer> {
  return sharp(png).flatten({ background: "#ffffff" }).webp({ quality: 80 }).toBuffer();
}

type Outcome = { state: "copied" | "skipped" | "dry"; bytes: number };

async function runTask(task: MediaTask): Promise<Outcome> {
  const sourceSize = await head(sourceClient, sourceEndpoint, sourceBucket, task.source);
  if (sourceSize === null) throw new Error(`missing source ${task.source}`);
  if (task.kind === "video" && !videoFits(sourceSize)) {
    throw new Error(`video too large (${sourceSize} bytes): ${task.source}`);
  }
  const existing = await head(destClient, destEndpoint, destBucket, task.dest);
  if (existing !== null && existing > 0 && (task.kind !== "video" || existing === sourceSize)) {
    return { state: "skipped", bytes: existing };
  }
  if (dryRun) return { state: "dry", bytes: sourceSize };
  const original = await download(task.source);
  const body =
    task.kind === "video"
      ? original
      : task.kind === "thumbnail"
        ? await toThumbnail(original)
        : await toFullImage(original);
  if (task.kind === "thumbnail" && body.length > MAX_THUMBNAIL_BYTES) {
    throw new Error(`thumbnail over the limit (${body.length} bytes): ${task.source}`);
  }
  await put(task.dest, body, CONTENT_TYPES[task.kind]);
  return { state: "copied", bytes: body.length };
}

const rowSchema = z.object({ id: z.string() });
const patch = z
  .object({ insert: z.array(rowSchema) })
  .parse(JSON.parse(readFileSync(values.patch, "utf8")));
const candidates = z
  .array(
    z.object({
      id: z.string(),
      source_video_key: z.string().nullable(),
      source_image_key: z.string().nullable(),
    }),
  )
  .parse(JSON.parse(readFileSync(values.candidates, "utf8")));
const byId = new Map(candidates.map((c) => [c.id, c]));

const limit = values.limit === undefined ? Infinity : Number(values.limit);
const rows = patch.insert.slice(0, limit);

interface Failure {
  id: string;
  key: string;
  reason: string;
}
const keys: Record<string, MediaKeys> = {};
const failures: Failure[] = [];
const totals = { copied: 0, skipped: 0, dry: 0, failed: 0, bytes: 0 };
const bytesByKind = { thumbnail: 0, video: 0, image: 0 };
let fatal: string | null = null;

async function runRow(id: string): Promise<void> {
  const candidate = byId.get(id);
  if (candidate === undefined) {
    failures.push({ id, key: "", reason: "no candidate for this row" });
    totals.failed++;
    return;
  }
  const plan = planRow({
    id,
    imageKey: candidate.source_image_key,
    videoKey: candidate.source_video_key,
  });
  if (plan.problem !== null) failures.push({ id, key: "", reason: plan.problem });
  const done: MediaTask[] = [];
  for (const task of plan.tasks) {
    if (fatal !== null) return;
    try {
      const outcome = await runTask(task);
      done.push(task);
      totals[outcome.state]++;
      totals.bytes += outcome.bytes;
      bytesByKind[task.kind] += outcome.bytes;
      log(`${outcome.state} ${task.kind} ${task.dest} ${outcome.bytes}`);
    } catch (error) {
      if (error instanceof FatalError) {
        fatal = error.message;
        return;
      }
      totals.failed++;
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ id, key: task.source, reason });
      log(`FAILED ${task.kind} ${task.source}: ${reason}`);
    }
  }
  keys[id] = keysFor(done);
}

const queue = [...rows];
const workers = Array.from({ length: Math.max(1, Number(values.concurrency)) }, async () => {
  for (let row = queue.shift(); row !== undefined && fatal === null; row = queue.shift()) {
    await runRow(row.id);
  }
});
await Promise.all(workers);

if (!dryRun) {
  writeFileSync(
    join(outDir, "media-keys.json"),
    `${JSON.stringify({ keys, failures }, null, 2)}\n`,
  );
}
log(
  `${dryRun ? "dry run" : "done"}: rows ${rows.length}, objects ok ${totals.copied + totals.skipped + totals.dry} ` +
    `(copied ${totals.copied}, skipped ${totals.skipped}, would copy ${totals.dry}), failed ${totals.failed}, ` +
    `bytes ${totals.bytes} (thumbnails ${bytesByKind.thumbnail}, videos ${bytesByKind.video}, images ${bytesByKind.image})`,
);
for (const failure of failures) log(`  failure ${failure.id} ${failure.key}: ${failure.reason}`);
if (fatal !== null) {
  log(`STOPPED: ${fatal}`);
  process.exit(1);
}
const publicBase = values["public-base"];
if (publicBase !== undefined && !dryRun) {
  for (const key of Object.values(keys).flatMap((k) => [k.thumbnail_key, k.video_key])) {
    if (key === null) continue;
    const res = await fetch(`${publicBase}/${encodeKey(key)}`, { method: "HEAD" });
    log(`public ${res.status} ${res.headers.get("content-type")} ${key}`);
    break;
  }
}
