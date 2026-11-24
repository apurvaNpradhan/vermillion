import { describe, expect, it } from "vitest";

import { EQUIPMENT, type Equipment } from "../../exercise/vocabulary";
import { historyForGym, usesGymHistory } from "./gym-history";

const at = (id: string, gymId: string | null) => ({ id, gymId });
const history = [at("a", "garage"), at("b", "home"), at("c", null), at("d", "garage")];

describe("which history drives suggestions", () => {
  it.each(["machine", "cable", "smith_machine"] satisfies Equipment[])(
    "%s prefers the Sessions at the same gym, in order",
    (equipment) => {
      expect(historyForGym(history, "garage", equipment).map((s) => s.id)).toEqual(["a", "d"]);
      expect(historyForGym(history, "home", equipment).map((s) => s.id)).toEqual(["b"]);
    },
  );

  it("falls back to any gym when the gym has none", () => {
    expect(historyForGym(history, "away", "machine")).toBe(history);
    expect(historyForGym([at("c", null)], "garage", "cable").map((s) => s.id)).toEqual(["c"]);
  });

  it("reads everything with no gym known", () => {
    expect(historyForGym(history, null, "machine")).toBe(history);
  });

  it.each(
    EQUIPMENT.filter((equipment) => !["machine", "cable", "smith_machine"].includes(equipment)),
  )("%s reads every gym", (equipment) => {
    expect(usesGymHistory(equipment)).toBe(false);
    expect(historyForGym(history, "garage", equipment)).toBe(history);
  });
});
