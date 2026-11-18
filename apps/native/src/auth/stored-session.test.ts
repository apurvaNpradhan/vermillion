import { isSessionExpired } from "@workspace/client/session";
import { describe, expect, it } from "vitest";

import { decodeSessionSnapshot, encodeSessionSnapshot } from "./session-snapshot";

const session = {
  user: { id: "u1", email: "a@example.com", name: "Ada", image: "https://x/y.png", role: "admin" },
  session: {
    id: "s1",
    token: "SECRET-TOKEN",
    userId: "u1",
    ipAddress: "10.0.0.1",
    expiresAt: new Date(Date.now() + 86_400_000),
  },
};
// SAFETY: a trimmed copy of a Better Auth session; the snapshot reads only the fields it keeps.
const asSession = (value: typeof session) => value as never;

describe("session snapshot", () => {
  it("keeps only identity and expiry: no token, no other user field", () => {
    const raw = encodeSessionSnapshot(asSession(session));
    for (const secret of ["SECRET-TOKEN", "10.0.0.1", "admin", "y.png", "s1"])
      expect(raw).not.toContain(secret);
    const read = decodeSessionSnapshot(raw);
    expect(read?.user).toEqual({ id: "u1", email: "a@example.com", name: "Ada" });
    expect(read && isSessionExpired(read)).toBe(false);
  });

  it("reads an expired snapshot as expired", () => {
    const expired = { ...session, session: { ...session.session, expiresAt: new Date(1000) } };
    const read = decodeSessionSnapshot(encodeSessionSnapshot(asSession(expired)));
    expect(read && isSessionExpired(read)).toBe(true);
  });

  it("ignores a missing, an older full-session and a corrupt value", () => {
    expect(decodeSessionSnapshot(null)).toBeNull();
    expect(decodeSessionSnapshot(JSON.stringify(session))).toBeNull();
    expect(decodeSessionSnapshot("{nope")).toBeNull();
  });
});
