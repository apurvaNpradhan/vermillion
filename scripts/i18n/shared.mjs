// Ported from morrow's i18n tooling and adapted to flat `feature__identifier` keys:
// every locale is one flat JSON object in packages/i18n/src/locales.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const localesDir = path.join(repoRoot, "packages/i18n/src/locales");
export const defaultLocale = "en";
export const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"];

/** Keys are `feature__identifier`, optionally followed by a plural category. */
export const KEY_PATTERN = /^[a-z]+__[a-z_]+$/u;

export async function loadLocales() {
  const entries = await fs.readdir(localesDir);
  const locales = await Promise.all(
    entries
      .filter((name) => /^[a-z]{2,3}(-[A-Z][A-Za-z]+)?\.json$/u.test(name))
      .toSorted()
      .map(async (name) => {
        const file = path.join(localesDir, name);
        return {
          locale: name.replace(/\.json$/u, ""),
          path: file,
          data: JSON.parse(await fs.readFile(file, "utf8")),
        };
      }),
  );
  const reference = locales.find(({ locale }) => locale === defaultLocale);
  if (!reference) throw new Error(`Missing reference locale: ${defaultLocale}.json`);
  return { locales, reference };
}

export async function writeLocale(file, data) {
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

/** `feature__thing_one` -> `feature__thing`; null when the key has no plural suffix. */
export function pluralBase(key) {
  for (const category of PLURAL_CATEGORIES) {
    const suffix = `_${category}`;
    if (key.endsWith(suffix)) return key.slice(0, -suffix.length);
  }
  return null;
}

/** The plural categories a language needs (CLDR). */
export function categoriesFor(locale) {
  try {
    return new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
  } catch (error) {
    throw new Error(`Unknown locale "${locale}": Intl.PluralRules rejected it`, { cause: error });
  }
}

/** `{{name}}` interpolation variables of a message. */
export function placeholders(message) {
  return new Set([...String(message).matchAll(/\{\{\s*([\w.]+)\s*\}\}/gu)].map((m) => m[1]));
}

const isCountBearing = (reference, key) =>
  typeof reference[key] === "string" && reference[key].includes("{{count}}");

/**
 * Compares one locale with the reference. Returns the keys it lacks, keys it
 * should not have, keys that break the naming rule and messages whose
 * `{{variables}}` differ from the reference's.
 */
export function compareLocale(reference, localeData, locale) {
  const referenceKeys = new Set(Object.keys(reference));
  const localeKeys = new Set(Object.keys(localeData));
  const required = categoriesFor(locale);
  // i18next selects _zero for an exact count of 0 even where CLDR omits it, so it
  // is accepted without being demanded.
  const allowed = new Set([...required, "zero"]);

  const families = new Set(referenceKeys.values().map(pluralBase).filter(Boolean));
  // A locale may pluralise a key the reference keeps singular.
  const ownFamilies = new Set(
    localeKeys
      .values()
      .map(pluralBase)
      .filter((base) => base && referenceKeys.has(base) && isCountBearing(reference, base)),
  );

  const missing = new Set(
    [...referenceKeys].filter((key) => {
      if (localeKeys.has(key) || ownFamilies.has(key)) return false;
      const base = pluralBase(key);
      if (!base) return true;
      const category = key.slice(base.length + 1);
      return category === "zero" || required.has(category);
    }),
  );
  for (const base of [...families, ...ownFamilies]) {
    for (const category of required) {
      if (!localeKeys.has(`${base}_${category}`)) missing.add(`${base}_${category}`);
    }
  }

  const extra = new Set(
    [...localeKeys].filter((key) => {
      if (referenceKeys.has(key)) return false;
      const base = pluralBase(key);
      const known =
        families.has(base) || (referenceKeys.has(base) && isCountBearing(reference, base));
      return !base || !known || !allowed.has(key.slice(base.length + 1));
    }),
  );

  const badNames = [...localeKeys].filter((key) => !KEY_PATTERN.test(key));

  const variableMismatches = [];
  for (const key of localeKeys) {
    const source = referenceValueFor(reference, key);
    if (source === undefined) continue;
    const expected = placeholders(source);
    const actual = placeholders(localeData[key]);
    // Plural forms of other languages may drop {{count}} in the singular, but every other variable must stay.
    const dropsOnlyCount = [...expected].every((name) => actual.has(name) || name === "count");
    const addsNone = [...actual].every((name) => expected.has(name));
    if (!dropsOnlyCount || !addsNone) variableMismatches.push(key);
  }

  return { missing, extra, badNames, variableMismatches };
}

/** The reference text of a key, or of its plural family when the locale has extra categories. */
function referenceValueFor(reference, key) {
  if (reference[key] !== undefined) return reference[key];
  const base = pluralBase(key);
  if (!base) return undefined;
  return [`${base}_other`, base, `${base}_one`]
    .map((k) => reference[k])
    .find((v) => v !== undefined);
}

export const sorted = (keys) => [...keys].toSorted((a, b) => a.localeCompare(b));
