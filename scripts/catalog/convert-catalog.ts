// Converts the source catalog file (a JSON array kept outside the repo) into the committed
// `packages/api/src/exercise/data/exercises.json`: English only, our field names, media URLs
// reduced to keys, sorted by id. Run `pnpm catalog:convert <source-path>`. The source is
// untrusted data: it is parsed and validated here, never executed.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
} from "../../packages/shared/src/exercise/vocabulary.ts";

const MEDIA_HOST = "media.lostsignal.cloud";
const OUTPUT = fileURLToPath(
  new URL("../../packages/api/src/exercise/data/exercises.json", import.meta.url),
);

function fail(index, message) {
  throw new Error(`source catalog entry ${index}: ${message}`);
}

function text(entry, index, field) {
  const value = entry[field];
  if (typeof value !== "string" || value.trim() === "") fail(index, `${field} must be text`);
  return value;
}

function optionalText(entry, index, field) {
  const value = entry[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail(index, `${field} must be text when present`);
  return value.trim() === "" ? null : value;
}

function slug(entry, index, field, allowed) {
  const value = text(entry, index, field);
  if (!allowed.includes(value)) fail(index, `unknown ${field} "${value}"`);
  return value;
}

function flag(entry, index, field) {
  if (typeof entry[field] !== "boolean") fail(index, `${field} must be true or false`);
  return entry[field];
}

/** The path after the media host, without the leading slash; null when the entry has no media. */
function mediaKey(entry, index, field) {
  const value = entry[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") fail(index, `${field} must be a URL`);
  let url;
  try {
    url = new URL(value);
  } catch {
    return fail(index, `${field} is not a URL`);
  }
  if (url.protocol !== "https:" || url.host !== MEDIA_HOST) {
    fail(index, `${field} is not on ${MEDIA_HOST}`);
  }
  if (url.search !== "" || url.hash !== "" || url.pathname.length < 2) {
    fail(index, `${field} has no plain path`);
  }
  return url.pathname.slice(1);
}

export function convertEntry(entry, index) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    fail(index, "not an object");
  }
  if (entry.is_custom === true) fail(index, "is a custom exercise");
  const primary = slug(entry, index, "muscle_group", MUSCLE_GROUPS);
  if (!Array.isArray(entry.other_muscles)) fail(index, "other_muscles must be a list");
  const secondary = [...new Set(entry.other_muscles)].toSorted();
  for (const muscle of secondary) {
    if (!MUSCLE_GROUPS.includes(muscle)) fail(index, `unknown other muscle "${muscle}"`);
  }
  if (secondary.includes(primary)) fail(index, "other_muscles contains the primary muscle");
  if (!Number.isInteger(entry.priority) || entry.priority < 0 || entry.priority > 32_767) {
    fail(index, "priority must be a small whole number");
  }
  const instructions = optionalText(entry.localised_instructions ?? {}, index, "en");
  const tags = optionalText(entry, index, "manual_tag");
  return {
    id: text(entry, index, "id"),
    title: text(entry, index, "title").trim(),
    primary_muscle: primary,
    secondary_muscles: secondary,
    equipment: slug(entry, index, "equipment_category", EQUIPMENT),
    exercise_type: slug(entry, index, "exercise_type", EXERCISE_TYPES),
    is_full_bodyweight: flag(entry, index, "hundred_percent_bodyweight_exercise"),
    rank: entry.priority,
    search_terms: tags === null ? null : tags.trim().toLowerCase(),
    aka: optionalText(entry, index, "aka"),
    instructions,
    video_key: mediaKey(entry, index, "url"),
    thumbnail_key: mediaKey(entry, index, "thumbnail_url"),
    retired: flag(entry, index, "is_archived"),
  };
}

export function convertCatalog(source) {
  if (!Array.isArray(source)) throw new Error("source catalog must be a JSON array");
  const rows = source
    .map(convertEntry)
    .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const [i, row] of rows.entries()) {
    if (i > 0 && rows[i - 1].id === row.id) throw new Error(`duplicate id ${row.id}`);
  }
  return rows;
}

const [, entry, sourcePath] = process.argv;
if (entry !== undefined && fileURLToPath(import.meta.url) === entry) {
  if (!sourcePath) {
    console.error("usage: pnpm catalog:convert <source-path>");
    process.exit(2);
  }
  const rows = convertCatalog(JSON.parse(readFileSync(sourcePath, "utf8")));
  writeFileSync(OUTPUT, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`wrote ${rows.length} exercises to ${OUTPUT}`);
}
