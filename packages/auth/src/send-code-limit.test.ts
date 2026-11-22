import { describe, expect, it } from "vitest";

import { SEND_CODE_PER_EMAIL, createSendCodeLimiter } from "./send-code-limit";

describe("per-address sign-in code limit", () => {
  it("refuses an address once it has used its window, whatever the letter case", () => {
    const limiter = createSendCodeLimiter(() => 0);
    for (let index = 0; index < SEND_CODE_PER_EMAIL.max; index += 1) {
      expect(limiter.hit("Person@Example.com")).toBe(true);
    }
    expect(limiter.hit(" person@example.com ")).toBe(false);
    expect(limiter.hit("other@example.com")).toBe(true);
  });

  it("opens again when the window has passed", () => {
    let time = 0;
    const limiter = createSendCodeLimiter(() => time);
    for (let index = 0; index <= SEND_CODE_PER_EMAIL.max; index += 1) limiter.hit("a@example.com");
    expect(limiter.hit("a@example.com")).toBe(false);
    time = SEND_CODE_PER_EMAIL.windowMs;
    expect(limiter.hit("a@example.com")).toBe(true);
  });
});
