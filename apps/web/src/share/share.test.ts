import { describe, expect, it } from "vitest";

import { buildAssetLinks } from "./assetlinks.ts";
import { fetchShare } from "./load-share.ts";
import { summariseSets } from "./summary.ts";

const FINGERPRINT = Array.from({ length: 32 }, (_, index) =>
  index.toString(16).padStart(2, "0").toUpperCase(),
).join(":");

describe("assetlinks", () => {
  it("is empty until a fingerprint is configured", () => {
    expect(buildAssetLinks("io.example.app", [])).toEqual([]);
  });

  it("publishes the package with its fingerprints, upper-cased", () => {
    expect(buildAssetLinks("io.example.app", [FINGERPRINT.toLowerCase()])).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "io.example.app",
          sha256_cert_fingerprints: [FINGERPRINT],
        },
      },
    ]);
  });

  it("drops a malformed fingerprint instead of publishing a file Android rejects", () => {
    expect(buildAssetLinks("io.example.app", ["AA:BB", FINGERPRINT])).toMatchObject([
      { target: { sha256_cert_fingerprints: [FINGERPRINT] } },
    ]);
    expect(buildAssetLinks("io.example.app", ["not a fingerprint"])).toEqual([]);
  });
});

describe("summariseSets", () => {
  it("shows the working sets, the weight and the warm-ups", () => {
    expect(
      summariseSets([
        { kind: "warmup", reps_min: 10, reps_max: 10, weight_kg: 40 },
        { kind: "working", reps_min: 5, reps_max: 8, weight_kg: 100 },
        { kind: "working", reps_min: 5, reps_max: 8, weight_kg: 100 },
      ]),
    ).toBe("2 × 5–8 · 100 kg · +1 warm-up");
  });

  it("handles duration sets and an empty list", () => {
    expect(summariseSets([{ kind: "working", duration_s: 45 }])).toBe("1 × 45 s");
    expect(summariseSets([])).toBe("");
  });
});

describe("fetchShare", () => {
  it("answers missing for a malformed code without calling the API", async () => {
    expect(await fetchShare("nope")).toEqual({ status: "missing" });
  });
});
