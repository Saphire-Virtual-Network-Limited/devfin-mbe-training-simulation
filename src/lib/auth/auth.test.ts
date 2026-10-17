import { describe, expect, it } from "vitest";
import { signToken, verifyToken, type SessionUser } from "./token";
import { hashPassword, verifyPassword } from "./password";

const secret = "x".repeat(40);
const user: SessionUser = { id: "MBE-E8CABF", name: "Ada Obi", staffCode: "MBE-E8CABF", role: "mbe", demo: false };

describe("session token", () => {
  it("round-trips a valid token", () => {
    expect(verifyToken(signToken(user, secret, 60), secret)).toEqual(user);
  });
  it("rejects a token signed with another secret", () => {
    expect(verifyToken(signToken(user, "y".repeat(40), 60), secret)).toBeNull();
  });
  it("rejects a tampered payload (e.g. upgrading role to trainer)", () => {
    const [, sig] = signToken(user, secret, 60).split(".");
    const forged = Buffer.from(JSON.stringify({ ...user, role: "trainer", exp: 9e9 })).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`, secret)).toBeNull();
  });
  it("rejects an expired token", () => {
    const t = signToken(user, secret, 60, Date.now() - 120_000);
    expect(verifyToken(t, secret)).toBeNull();
  });
  it("rejects junk", () => {
    expect(verifyToken(undefined, secret)).toBeNull();
    expect(verifyToken("a.b.c", secret)).toBeNull();
    expect(verifyToken("not-a-token", secret)).toBeNull();
  });
});

describe("demo password hash", () => {
  it("verifies the right password and rejects others", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
  it("rejects malformed stored hashes instead of throwing", async () => {
    expect(await verifyPassword("x", "plain-text")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$1$1$a$b")).toBe(false);
  });
});
