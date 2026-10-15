import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route handler tests with the database and cookie store replaced by
 * in-memory fakes, so they run without Neon or a browser.
 */

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
}));

const db = { failures: [] as string[], attempts: [] as unknown[][], trainees: [] as unknown[][] };
vi.mock("@/lib/db", () => ({
  sql: () => (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join("?");
    if (q.includes("FROM login_failures")) {
      const [u, ip] = values as string[];
      return Promise.resolve([{ user_fails: db.failures.filter((k) => k === u).length, ip_fails: db.failures.filter((k) => k === ip).length }]);
    }
    if (q.includes("INSERT INTO login_failures")) {
      db.failures.push(values[0] as string, values[1] as string);
      return Promise.resolve([]);
    }
    if (q.includes("INSERT INTO trainees")) {
      db.trainees.push(values);
      return Promise.resolve([]);
    }
    if (q.includes("count(*)::int AS n FROM attempts")) return Promise.resolve([{ n: 0 }]);
    if (q.includes("INSERT INTO attempts")) {
      db.attempts.push(values);
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  },
}));

const { hashPassword } = await import("@/lib/auth/password");
const login = await import("./auth/login/route");
const attempts = await import("./attempts/route");

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://train.example.com/api", {
    method: "POST",
    headers: { "content-type": "application/json", host: "train.example.com", origin: "https://train.example.com", "x-forwarded-for": "1.2.3.4", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  jar.clear();
  db.failures = [];
  db.attempts = [];
  db.trainees = [];
  process.env.SESSION_SECRET = "s".repeat(48);
  process.env.DEMO_LOGIN_ENABLED = "true";
  process.env.DEMO_LOGIN_USERNAME = "demo";
  process.env.DEMO_LOGIN_PASSWORD_HASH = await hashPassword("demo-password-123");
  process.env.DEMO_LOGIN_ROLE = "mbe";
});

describe("POST /api/auth/login", () => {
  it("signs in the demo account and sets an httpOnly session", async () => {
    const res = await login.POST(json({ username: "Demo", password: "demo-password-123" }));
    expect(res.status).toBe(200);
    expect(jar.get("dfp_session")).toBeTruthy();
    expect(db.trainees[0]?.[0]).toBe("demo:demo");
  });

  it("rejects a wrong password without saying which part was wrong", async () => {
    const res = await login.POST(json({ username: "demo", password: "nope" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("INVALID_CREDENTIALS");
    expect(jar.size).toBe(0);
  });

  it("locks the account after 5 failures", async () => {
    for (let i = 0; i < 5; i++) await login.POST(json({ username: "demo", password: "nope" }));
    const res = await login.POST(json({ username: "demo", password: "demo-password-123" }));
    expect(res.status).toBe(429);
  });

  it("says plainly when staff sign-in isn't connected", async () => {
    const res = await login.POST(json({ username: "MBE-E8CABF", password: "whatever" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("STAFF_LOGIN_UNAVAILABLE");
  });

  it("blocks cross-site posts", async () => {
    const res = await login.POST(json({ username: "demo", password: "demo-password-123" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("does not expose internals on server errors", async () => {
    delete process.env.SESSION_SECRET;
    const res = await login.POST(json({ username: "demo", password: "demo-password-123" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("SESSION_SECRET");
  });
});

describe("/api/attempts", () => {
  const attempt = { scenarioId: "smooth", mode: "practice", mistakes: [], critical: [], completed: true, reached: 8, durationSec: 300, endReason: "Completed all 8 steps" };

  it("requires a session", async () => {
    expect((await attempts.POST(json(attempt))).status).toBe(401);
    expect((await attempts.GET()).status).toBe(401);
  });

  it("stores a valid attempt with a server-computed score", async () => {
    await login.POST(json({ username: "demo", password: "demo-password-123" }));
    const res = await attempts.POST(json({ ...attempt, mistakes: [{ code: "DATA", pts: 3, step: 3, msg: "Email didn't match." }] }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ score: 97, passed: true });
    expect(db.attempts).toHaveLength(1);
  });

  it("rejects malformed attempts", async () => {
    await login.POST(json({ username: "demo", password: "demo-password-123" }));
    expect((await attempts.POST(json({ ...attempt, scenarioId: "made-up" }))).status).toBe(422);
  });
});
