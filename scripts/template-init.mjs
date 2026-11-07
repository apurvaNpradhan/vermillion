#!/usr/bin/env node
// Rewrites the values that cannot import app.config.ts (JSON, YAML, compose,
// wrangler) so they match it. Edit app.config.ts first, then run:
//
//   pnpm template:init            apply
//   pnpm template:init --dry-run  show what would change
//
// Idempotent: every rule matches structure, not the previous name, so running
// it twice (or on an already-initialised fork) changes nothing.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SLUG = /^[a-z][a-z0-9-]*$/;

/** Throws with a readable message when the config cannot be projected onto the derived files. */
export function validateConfig(config) {
  const problems = [];
  if (!SLUG.test(config.name))
    problems.push(`name "${config.name}" must be a lowercase slug (a-z, 0-9, -)`);
  if (!SLUG.test(config.scheme))
    problems.push(`scheme "${config.scheme}" must be a lowercase slug`);
  for (const [platform, id] of Object.entries(config.bundleIds)) {
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(id)) {
      problems.push(`bundleIds.${platform} "${id}" must look like com.company.app`);
    }
  }
  let production;
  try {
    production = new URL(config.productionUrl);
  } catch {
    problems.push(`productionUrl "${config.productionUrl}" is not a URL`);
  }
  if (production && production.protocol !== "https:") problems.push("productionUrl must be https");
  if (production && production.pathname !== "/")
    problems.push("productionUrl must be an origin without a path");
  if (
    !config.cloudflareZone ||
    (production &&
      production.hostname !== config.cloudflareZone &&
      !production.hostname.endsWith(`.${config.cloudflareZone}`))
  )
    problems.push("cloudflareZone must be the DNS zone containing productionUrl");
  if (problems.length > 0) throw new Error(`Invalid app.config.ts:\n- ${problems.join("\n- ")}`);
}

function replaceOnce(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`template:init: no match for ${label}`);
  return source.replace(pattern, replacement);
}

/** One entry per derived file: `transform(source, config)` returns the new source. */
export const rules = [
  {
    file: "package.json",
    transform: (source, config) =>
      replaceOnce(source, /^(\s*"name": )"[^"]*"/m, `$1"${config.name}"`, "package.json name"),
  },
  {
    file: "docker-compose.yml",
    transform(source, config) {
      const db = config.name.replaceAll("-", "_");
      let next = source;
      next = replaceOnce(next, /^name: .*/m, `name: ${config.name}`, "compose name");
      next = replaceOnce(
        next,
        /container_name: .*/,
        `container_name: ${config.name}-postgres`,
        "container_name",
      );
      next = replaceOnce(next, /POSTGRES_DB: .*/, `POSTGRES_DB: ${db}`, "POSTGRES_DB");
      next = replaceOnce(
        next,
        /pg_isready -U postgres -d \w+/,
        `pg_isready -U postgres -d ${db}`,
        "healthcheck",
      );
      next = next.replaceAll(
        /\b\w+_postgres_data\b/g,
        `${config.name.replaceAll("-", "_")}_postgres_data`,
      );
      next = replaceOnce(
        next,
        /"(?:127\.0\.0\.1:)?\d+:5432"/,
        `"127.0.0.1:${config.ports.postgres}:5432"`,
        "postgres port",
      );
      next = replaceOnce(
        next,
        /(DATABASE_URL=postgresql:\/\/postgres:password@localhost:)\d+\/\w+/,
        `$1${config.ports.postgres}/${db}`,
        "DATABASE_URL comment",
      );
      // Container-side URLs read the database name from a variable with a default.
      next = next.replaceAll(/\$\{POSTGRES_DB:-\w+\}/g, `\${POSTGRES_DB:-${db}}`);
      next = replaceOnce(
        next,
        /"(?:127\.0\.0\.1:)?\d+:8080"/,
        `"127.0.0.1:${config.ports.powersync}:8080"`,
        "powersync port",
      );
      next = replaceOnce(
        next,
        /(PS_JWKS_URI: http:\/\/host\.docker\.internal:)\d+/,
        `$1${config.ports.server}`,
        "powersync JWKS port",
      );
      return next;
    },
  },
  {
    file: "apps/server/.env.example",
    transform(source, config) {
      const next = replaceOnce(source, /^(APP_URL=).*$/m, `$1${config.urls.web}`, "APP_URL");
      return replaceOnce(
        next,
        /(DATABASE_URL=postgresql:\/\/postgres:password@localhost:)\d+\/\w+/,
        `$1${config.ports.postgres}/${config.name.replaceAll("-", "_")}`,
        "DATABASE_URL",
      );
    },
  },
  {
    file: "apps/web/.env.example",
    transform: (source, config) =>
      replaceOnce(source, /^(VITE_SERVER_URL=).*$/m, `$1${config.urls.web}`, "web API URL"),
  },
  {
    file: "apps/native/.env.example",
    transform: (source, config) =>
      replaceOnce(
        source,
        /^(EXPO_PUBLIC_SERVER_URL=).*$/m,
        `$1${config.urls.server}`,
        "native API URL",
      ),
  },
  {
    file: "apps/web/playwright.config.ts",
    transform: (source, config) =>
      replaceOnce(
        source,
        /(localhost:)\d+\/\w+_e2e/,
        `$1${config.ports.postgres}/${config.name.replaceAll("-", "_")}_e2e`,
        "e2e database",
      ),
  },
  {
    file: ".github/workflows/ci.yml",
    transform: (source, config) =>
      replaceOnce(
        replaceOnce(
          source,
          /^([ \t]*- )\d+:5432$/m,
          `$1${config.ports.postgres}:5432`,
          "ci postgres port",
        ),
        /(E2E_DATABASE_URL: postgresql:\/\/postgres:password@localhost:)\d+\/\w+_e2e/,
        `$1${config.ports.postgres}/${config.name.replaceAll("-", "_")}_e2e`,
        "ci e2e database",
      ),
  },
  {
    file: "apps/server/Dockerfile",
    transform(source, config) {
      let next = replaceOnce(
        source,
        /^EXPOSE \d+/m,
        `EXPOSE ${config.ports.server}`,
        "Dockerfile EXPOSE",
      );
      next = replaceOnce(
        next,
        /127\.0\.0\.1:\d+\/api\/health/,
        `127.0.0.1:${config.ports.server}/api/health`,
        "Dockerfile healthcheck",
      );
      return next;
    },
  },
  {
    file: "apps/web/wrangler.jsonc",
    transform(source, config) {
      const host = new URL(config.productionUrl).hostname;
      let next = replaceOnce(
        source,
        /^(\s*"name": )"[^"]*"/m,
        `$1"${config.name}-web"`,
        "wrangler name",
      );
      next = replaceOnce(
        next,
        /"routes": \[\{ "pattern": "[^"]*", "zone_name": "[^"]*" \}\]/,
        `"routes": [{ "pattern": "${host}/*", "zone_name": "${config.cloudflareZone}" }]`,
        "wrangler routes",
      );
      return next;
    },
  },
  {
    file: "apps/native/eas.json",
    transform(source, config) {
      let next = replaceOnce(
        source,
        /("development": \{[^}]*"EXPO_PUBLIC_SERVER_URL": ")[^"]*"/,
        `$1${config.urls.server}"`,
        "eas development url",
      );
      next = replaceOnce(
        next,
        /("production": \{[^}]*"EXPO_PUBLIC_SERVER_URL": ")[^"]*"/,
        `$1${config.productionUrl}"`,
        "eas production url",
      );
      return next;
    },
  },
  {
    file: "README.md",
    transform: (source, config) =>
      replaceOnce(source, /^# .*/m, `# ${config.displayName}`, "README title"),
  },
];

/**
 * Computes (and unless `dryRun`, writes) the derived files. Returns one result per rule:
 * `changed`, `unchanged` or `missing` (the fork deleted the file, which is fine).
 */
export function initTemplate({ root, config, dryRun = false }) {
  validateConfig(config);
  const results = [];
  for (const rule of rules) {
    const file = path.join(root, rule.file);
    if (!existsSync(file)) {
      results.push({ file: rule.file, status: "missing" });
      continue;
    }
    const before = readFileSync(file, "utf8");
    const after = rule.transform(before, config);
    if (after === before) {
      results.push({ file: rule.file, status: "unchanged" });
      continue;
    }
    if (!dryRun) writeFileSync(file, after);
    results.push({ file: rule.file, status: "changed" });
  }
  return results;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dryRun = process.argv.includes("--dry-run");
  const { appConfig } = await import(pathToFileURL(path.join(root, "app.config.ts")).href);
  const results = initTemplate({ root, config: appConfig, dryRun });
  for (const { file, status } of results) console.log(`${status.padEnd(9)} ${file}`);
  const changed = results.filter((result) => result.status === "changed").length;
  console.log(
    dryRun ? `\n${changed} file(s) would change (dry run).` : `\n${changed} file(s) changed.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
