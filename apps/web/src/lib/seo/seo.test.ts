import { describe, expect, it } from "vitest";

import { canonicalUrl, seoHead } from "./head";
import { buildRobots, buildSitemap } from "./sitemap";

const origin = "https://app.example.com";

describe("canonicalUrl", () => {
  it("drops query, hash and trailing slashes but keeps the root", () => {
    expect(canonicalUrl(origin, "/privacy/?utm=1#top")).toBe("https://app.example.com/privacy");
    expect(canonicalUrl(origin, "/")).toBe("https://app.example.com/");
  });
  it("always uses the configured origin", () => {
    expect(canonicalUrl(`${origin}/ignored`, "/terms")).toBe("https://app.example.com/terms");
  });
});

describe("seoHead", () => {
  const base = { appName: "Acme", origin, description: "About", path: "/terms" };
  it("builds title, canonical and Open Graph", () => {
    const head = seoHead({ ...base, title: "Terms" });
    expect(head.meta).toContainEqual({ title: "Terms · Acme" });
    expect(head.meta).toContainEqual({
      property: "og:url",
      content: "https://app.example.com/terms",
    });
    expect(head.links).toEqual([{ rel: "canonical", href: "https://app.example.com/terms" }]);
  });
  it("uses the app name alone for the home page", () => {
    expect(seoHead({ ...base, path: "/" }).meta).toContainEqual({ title: "Acme" });
  });
  it("marks private pages noindex and gives them no canonical", () => {
    const head = seoHead({ ...base, noindex: true });
    expect(head.meta).toContainEqual({ name: "robots", content: "noindex, nofollow" });
    expect(head.links).toEqual([]);
  });
});

describe("sitemap and robots", () => {
  it("lists every public path with absolute URLs", () => {
    const xml = buildSitemap(origin, ["/", "/privacy"]);
    expect(xml).toContain("<loc>https://app.example.com/</loc>");
    expect(xml).toContain("<loc>https://app.example.com/privacy</loc>");
  });
  it("escapes XML in locations", () => {
    expect(buildSitemap(origin, ["/a&b"])).toContain("/a&amp;b");
  });
  it("points robots at the sitemap and hides the app", () => {
    const robots = buildRobots(origin);
    expect(robots).toContain("Sitemap: https://app.example.com/sitemap.xml");
    expect(robots).toContain("Disallow: /app");
  });
});
