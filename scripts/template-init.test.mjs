import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initTemplate, rules, validateConfig } from "./template-init.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const config = {
  name: "acme-notes",
  displayName: "Acme Notes",
  version: "1.0.0",
  urls: { web: "http://localhost:4001", server: "http://localhost:4000" },
  productionUrl: "https://notes.acme.dev",
  cloudflareZone: "acme.dev",
  ports: { web: 4001, server: 4000, native: 8081, postgres: 5544 },
  bundleIds: { ios: "dev.acme.notes", android: "dev.acme.notes" },
  scheme: "acme-notes",
};

let root;
const read = (file) => readFileSync(path.join(root, file), "utf8");

beforeEach(() => {
  // A temp copy of just the derived files, so the real repo is never touched.
  root = mkdtempSync(path.join(os.tmpdir(), "template-init-"));
  for (const { file } of rules) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    cpSync(path.join(repoRoot, file), path.join(root, file));
  }
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("template-init", () => {
  it("rewrites the derived values from the config", () => {
    initTemplate({ root, config });

    expect(JSON.parse(read("package.json")).name).toBe("acme-notes");
    const compose = read("docker-compose.yml");
    expect(compose).toContain("name: acme-notes");
    expect(compose).toContain("POSTGRES_DB: acme_notes");
    expect(compose).toContain('"127.0.0.1:5544:5432"');
    expect(compose).toContain("acme_notes_postgres_data:/var/lib/postgresql");
    expect(read("apps/server/.env.example")).toContain("localhost:5544/acme_notes");
    expect(read("apps/server/.env.example")).toContain("APP_URL=http://localhost:4001");
    expect(read("apps/web/.env.example")).toContain("VITE_SERVER_URL=http://localhost:4001");
    expect(read("apps/native/.env.example")).toContain(
      "EXPO_PUBLIC_SERVER_URL=http://localhost:4000",
    );
    expect(read(".github/workflows/ci.yml")).toContain("- 5544:5432");
    expect(read("apps/web/playwright.config.ts")).toContain("localhost:5544/acme_notes_e2e");
    expect(read(".github/workflows/ci.yml")).toContain("localhost:5544/acme_notes_e2e");
    expect(read("apps/server/Dockerfile")).toContain("EXPOSE 4000");
    expect(read("apps/server/Dockerfile")).toContain("127.0.0.1:4000/api/health");
    const wrangler = read("apps/web/wrangler.jsonc");
    expect(wrangler).toContain('"name": "acme-notes-web"');
    expect(wrangler).toContain('{ "pattern": "notes.acme.dev/*", "zone_name": "acme.dev" }');
    const eas = JSON.parse(read("apps/native/eas.json"));
    expect(eas.build.production.env.EXPO_PUBLIC_SERVER_URL).toBe("https://notes.acme.dev");
    expect(eas.build.development.env.EXPO_PUBLIC_SERVER_URL).toBe("http://localhost:4000");
    expect(read("README.md").split("\n")[0]).toBe("# Acme Notes");
  });

  it("preserves an explicit multi-label Cloudflare zone on repeated initialization", () => {
    const uk = {
      ...config,
      productionUrl: "https://app.example.co.uk",
      cloudflareZone: "example.co.uk",
    };
    initTemplate({ root, config: uk });
    initTemplate({ root, config: uk });
    expect(read("apps/web/wrangler.jsonc")).toContain('"zone_name": "example.co.uk"');
    expect(() => validateConfig({ ...uk, cloudflareZone: "other.co.uk" })).toThrow(
      /cloudflareZone/,
    );
  });

  it("is idempotent", () => {
    initTemplate({ root, config });
    const second = initTemplate({ root, config });

    expect(second.map((result) => result.status)).not.toContain("changed");
  });

  it("writes nothing on a dry run but reports the changes", () => {
    const before = read("docker-compose.yml");
    const results = initTemplate({ root, config, dryRun: true });

    expect(results.some((result) => result.status === "changed")).toBe(true);
    expect(read("docker-compose.yml")).toBe(before);
  });

  it("skips files a fork deleted", () => {
    rmSync(path.join(root, "apps/native/eas.json"));

    const results = initTemplate({ root, config });

    expect(results.find((result) => result.file === "apps/native/eas.json")?.status).toBe(
      "missing",
    );
  });

  it("rejects a config it cannot project", () => {
    expect(() => validateConfig({ ...config, name: "Not A Slug" })).toThrow(/lowercase slug/);
    expect(() => validateConfig({ ...config, productionUrl: "http://x.dev" })).toThrow(/https/);
    expect(() =>
      validateConfig({ ...config, bundleIds: { ios: "nodots", android: "a.b" } }),
    ).toThrow(/bundleIds.ios/);
  });
});
