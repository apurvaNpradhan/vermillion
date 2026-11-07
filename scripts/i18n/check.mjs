// Every locale has the keys of the reference locale, with the plural forms its
// language needs, the same {{variables}} and `feature__identifier` names.
// `--fix` adds missing keys using the reference text, to be translated.
import { compareLocale, defaultLocale, loadLocales, sorted, writeLocale } from "./shared.mjs";

const shouldFix = process.argv.includes("--fix");
const { locales, reference } = await loadLocales();

let failed = false;
for (const locale of locales.filter(({ locale: name }) => name !== defaultLocale)) {
  const result = compareLocale(reference.data, locale.data, locale.locale);
  const problems = [
    ["Missing keys", result.missing],
    ["Extra keys", result.extra],
    ["Keys not named feature__identifier", result.badNames],
    ["Messages with different {{variables}}", result.variableMismatches],
  ].filter(([, keys]) => keys.size > 0 || keys.length > 0);

  if (problems.length === 0) {
    console.log(`${locale.locale}: OK`);
    continue;
  }
  failed = true;
  console.log(`${locale.locale}:`);
  for (const [title, keys] of problems) {
    console.log(`  ${title}:`);
    for (const key of sorted(keys)) console.log(`    - ${key}`);
  }
  if (shouldFix && result.missing.size > 0) {
    for (const key of result.missing) {
      locale.data[key] =
        reference.data[key] ?? locale.data[key.replace(/_[a-z]+$/u, "_other")] ?? "";
    }
    await writeLocale(locale.path, locale.data);
    console.log("  Added missing keys with the reference text; translate them.");
  }
}

const badReference = Object.keys(reference.data).filter((key) => !/^[a-z]+__[a-z_]+$/u.test(key));
if (badReference.length > 0) {
  failed = true;
  console.log(
    `${defaultLocale}: keys not named feature__identifier:\n  - ${badReference.join("\n  - ")}`,
  );
}

if (!failed) console.log(`All locale files are in sync with ${defaultLocale}.`);
process.exit(failed && !shouldFix ? 1 : 0);
