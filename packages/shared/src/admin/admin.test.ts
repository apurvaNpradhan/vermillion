import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS, assertAuditDetail, auditActionSchema } from "./audit";
import { INVITE_TTL_MS, inviteAllowsSignUp, inviteState, normalizeEmail } from "./invites";

describe("invite state", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const later = new Date(now.getTime() + INVITE_TTL_MS);
  const earlier = new Date(now.getTime() - 1);

  it("derives expired from a past expiry on an invited row only", () => {
    expect(inviteState("invited", later, now)).toBe("invited");
    expect(inviteState("invited", earlier, now)).toBe("expired");
    expect(inviteState("redeemed", earlier, now)).toBe("redeemed");
    expect(inviteState("requested", null, now)).toBe("requested");
  });

  it("lets only a live invite sign up", () => {
    expect(inviteAllowsSignUp("invited", later, now)).toBe(true);
    expect(inviteAllowsSignUp("invited", earlier, now)).toBe(false);
    expect(inviteAllowsSignUp("requested", null, now)).toBe(false);
    expect(inviteAllowsSignUp("revoked", later, now)).toBe(false);
    expect(inviteAllowsSignUp("redeemed", later, now)).toBe(false);
  });

  it("normalises addresses", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
  });
});

describe("audit vocabulary", () => {
  it("names every action as a dotted slug", () => {
    for (const action of AUDIT_ACTIONS) expect(action).toMatch(/^[a-z]+\.[a-z_]+$/);
    expect(auditActionSchema.safeParse("user.promote").success).toBe(false);
  });

  it("validates the detail of each action", () => {
    expect(() =>
      assertAuditDetail({
        action: "user.ban",
        targetType: "user",
        targetId: "u",
        detail: { reason: "spam" },
      }),
    ).not.toThrow();
    expect(() =>
      assertAuditDetail({
        action: "release.set_minimum",
        targetType: "setting",
        targetId: "minimum_app_version",
        detail: { reason: "x" }, // the shape of another action
      }),
    ).toThrow();
  });
});
