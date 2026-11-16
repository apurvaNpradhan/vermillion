import { describe, expect, it } from "vitest";
import { createI18n } from "@workspace/i18n";
import { formatEffortRange } from "./effort";

describe("training display", () => {
  it("uses singular and plural session and set counts", () => {
    const { t } = createI18n();
    expect(t("stats__sessions", { count: 1 })).toBe("1 session");
    expect(t("stats__sessions", { count: 2 })).toBe("2 sessions");
    expect(t("stats__sets", { count: 1 })).toBe("1 set");
    expect(t("stats__sets", { count: 0 })).toBe("0 sets");
  });
  it("displays stored RPE in the user's effort scale", () => {
    expect(formatEffortRange(8, 8, "rir")).toBe("2");
    expect(formatEffortRange(8, 8, "rpe")).toBe("8");
    expect(formatEffortRange(7, 9, "rir")).toBe("1–3");
  });
});
