import { describe, expect, it } from "vitest";

import { classifyRequest, isPrecacheable, staleCaches } from "./policy.ts";

const origin = "https://app.example.com";
const classify = (path: string, method = "GET", mode = "cors", range = false) =>
  classifyRequest(new URL(path, origin), origin, method, mode, range);

describe("classifyRequest", () => {
  it("answers navigations and fingerprinted assets", () => {
    expect(classify("/notes", "GET", "navigate")).toBe("navigation");
    expect(classify("/assets/index-abc.js")).toBe("asset");
  });

  it("never touches API, RPC or auth, even for navigations", () => {
    expect(classify("/api/auth/get-session")).toBe("ignore");
    expect(classify("/api/auth/callback/google", "GET", "navigate")).toBe("ignore");
    expect(classify("/rpc/notes/list")).toBe("ignore");
  });

  it("ignores writes, other origins, ranges, its own script and unfingerprinted files", () => {
    expect(classify("/assets/x.js", "POST")).toBe("ignore");
    expect(
      classifyRequest(new URL("https://cdn.example.net/assets/x.js"), origin, "GET", "cors", false),
    ).toBe("ignore");
    expect(classify("/assets/video.mp4", "GET", "cors", true)).toBe("ignore");
    expect(classify("/sw.js", "GET", "navigate")).toBe("ignore");
    expect(classify("/robots.txt")).toBe("ignore");
  });
});

describe("isPrecacheable", () => {
  it("skips source maps, dotfiles and the unused SQLite builds, keeps the rest", () => {
    expect(isPrecacheable("assets/index-abc.js.map")).toBe(false);
    expect(isPrecacheable(".assetsignore")).toBe(false);
    expect(isPrecacheable("assets/mc-wa-sqlite-abc.wasm")).toBe(false);
    expect(isPrecacheable("assets/wa-sqlite-async-abc.wasm")).toBe(false);
    expect(isPrecacheable("assets/wa-sqlite-abc.wasm")).toBe(true);
    expect(isPrecacheable("assets/worker-abc.js")).toBe(true);
    expect(isPrecacheable("assets/app-abc.css")).toBe(true);
  });
});

describe("staleCaches", () => {
  it("keeps the newest generations of the worker's own family only", () => {
    const names = ["shell-1", "other", "shell-2", "shell-3"];
    expect(staleCaches(names, "shell-", 2)).toEqual(["shell-1"]);
    expect(staleCaches(["shell-1"], "shell-", 2)).toEqual([]);
  });
});
