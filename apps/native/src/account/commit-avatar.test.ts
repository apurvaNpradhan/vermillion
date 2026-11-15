import { describe, expect, it } from "vitest";
import { commitAvatar } from "./commit-avatar";
describe("avatar commit recovery", () => {
  for (const authoritative of ["new", "unavailable", "old"]) {
    it(`preserves the selection unless the server proves it unused: ${authoritative}`, async () => {
      let discarded = false;
      const result = commitAvatar(
        "new",
        async () => {
          throw new Error("response lost");
        },
        async () => {
          if (authoritative === "unavailable") throw new Error("offline");
          return authoritative;
        },
        async () => {
          discarded = true;
        },
      );
      if (authoritative === "old") await expect(result).rejects.toThrow("response lost");
      else await result;
      expect(discarded).toBe(authoritative === "old");
    });
  }
});
