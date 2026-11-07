import { describe, expect, it } from "vitest";

import { parseUserAgent } from "./user-agent";

describe("parseUserAgent", () => {
  it("names the browser and system, never the raw string", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(parseUserAgent(ua)).toEqual({ browser: "Safari", os: "macOS" });
  });
  it("returns nothing for unknown or missing agents", () => {
    expect(parseUserAgent("curl/8")).toBeUndefined();
    expect(parseUserAgent(null)).toBeUndefined();
  });
});
