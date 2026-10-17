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

type Mbe = { code: string; phone: string; name: string; store: string; active: boolean; is_demo: boolean };
const db = { failures: [] as string[], attempts: [] as unknown[][], mbes: new Map<string, Mbe>() };

vi.mock("@/lib/db", () => ({
  sql: () => (strings: TemplateStringsArray, ...v: unknown[]) => {
    const q = strings.join("?");
    const ok = (rows: unknown[] = []) => Promise.resolve(rows);
    if (q.includes("FROM login_failures")) {
      const [c, ip] = v as string[];
      return ok([{ code_fails: db.failures.filter((k) => k === c).length, ip_fails: db.failures.filter((k) => k === ip).length }]);
    }
    if (q.includes("INSERT INTO login_failures")) return db.failures.push(v[0] as string, v[1] as string), ok();
    if (q.includes("SELECT code, phone, name, active FROM mbes")) {
      const m = db.mbes.get(v[0] as string);
      return ok(m ? [m] : []);
    }
    if (q.includes("SELECT code FROM mbes WHERE phone")) {
      const [phone, code] = v as string[];
      return ok([...db.mbes.values()].filter((m) => m.phone === phone && m.code !== code && m.active && !m.is_demo));
    }
    if (q.includes("INSERT INTO mbes (code, phone, name, store)\n")) {
      const [code, phone, name, store] = v as string[];
      const existed = db.mbes.has(code);
      db.mbes.set(code, { code, phone, name, store, active: db.mbes.get(code)?.active ?? true, is_demo: false });
      return ok([{ inserted: !existed }]);
    }
    if (q.includes("INSERT INTO mbes (code, phone, name, store, is_demo)")) {
      const [code, phone, name] = v as string[];
      db.mbes.set(code, { code, phone, name, store: "Demo", active: true, is_demo: true });
      return ok();
    }
    if (q.includes("UPDATE mbes SET active")) {
      const [active, code] = v as [boolean, string];
      const m = db.mbes.get(code);
      if (!m || m.is_demo) return ok();
      m.active = active;
      return ok([{ code }]);
    }
    if (q.includes("count(*)::int AS n FROM attempts")) return ok([{ n: 0 }]);
    if (q.includes("INSERT INTO attempts")) return db.attempts.push(v), ok();
    return ok();
  },
}));

const { hashPassword } = await import("@/lib/auth/password");
const login = await import("./auth/login/route");
const attempts = await import("./attempts/route");
const roster = await import("./roster/route");

const req = (body: unknown, headers: Record<string, string> = {}, method = "POST") =>
  new Request("https://train.example.com/api", {
    method,
    headers: { "content-type": "application/json", host: "train.example.com", origin: "https://train.example.com", "x-forwarded-for": "1.2.3.4", ...headers },
    body: JSON.stringify(body),
  });

const ada: Mbe = { code: "MBE-E8CABF", phone: "08031234567", name: "Ada Obi", store: "Ikeja", active: true, is_demo: false };
const tina: Mbe = { code: "MBE-TRAIN1", phone: "09061234567", name: "Tina Trainer", store: "HQ", active: true, is_demo: false };

beforeEach(async () => {
  jar.clear();
  db.failures = [];
  db.attempts = [];
  db.mbes = new Map([[ada.code, { ...ada }], [tina.code, { ...tina }]]);
  process.env.SESSION_SECRET = "s".repeat(48);
  process.env.DEMO_LOGIN_ENABLED = "true";
  process.env.DEMO_MBE_CODE = "DEMO-0001";
  process.env.DEMO_MBE_PHONE = "08000000001";
  process.env.TRAINER_CODES = "MBE-TRAIN1";
  process.env.TRAINER_PASSCODE_HASH = await hashPassword("trainer-passcode-1");
});

const signIn = (code: string, phone: string, passcode?: string) => login.POST(req({ code, phone, passcode }));

describe("sign-in with MBE code + phone", () => {
  it("signs in an MBE on the list, in any common phone format", async () => {
    const res = await signIn("mbe-e8cabf", "+234 803 123 4567");
    expect(res.status).toBe(200);
    expect(jar.get("dfp_session")).toBeTruthy();
  });

  it("rejects a phone that doesn't belong to that code, without saying which part was wrong", async () => {
    const res = await signIn("MBE-E8CABF", "09099999999");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("NO_MATCH");
    expect((await signIn("MBE-NOPE00", "08031234567")).status).toBe(401);
  });

  it("locks a code after 5 failures", async () => {
    for (let i = 0; i < 5; i++) await signIn("MBE-E8CABF", "09099999999");
    expect((await signIn("MBE-E8CABF", "08031234567")).status).toBe(429);
  });

  it("refuses MBEs whose access was switched off", async () => {
    db.mbes.get("MBE-E8CABF")!.active = false;
    expect((await signIn("MBE-E8CABF", "08031234567")).status).toBe(403);
  });

  it("asks trainers for the passcode, then checks it", async () => {
    const first = await signIn("MBE-TRAIN1", "09061234567");
    expect((await first.json()).error.code).toBe("PASSCODE_REQUIRED");
    expect(jar.size).toBe(0);
    expect((await signIn("MBE-TRAIN1", "09061234567", "wrong")).status).toBe(401);
    expect((await signIn("MBE-TRAIN1", "09061234567", "trainer-passcode-1")).status).toBe(200);
  });

  it("lets the demo account practise but never act as a trainer", async () => {
    expect((await signIn("DEMO-0001", "08000000001")).status).toBe(200);
    expect(db.mbes.get("DEMO-0001")?.is_demo).toBe(true);
    expect((await roster.POST(req({ code: "MBE-X1", phone: "07031234567", name: "X Y" }))).status).toBe(403);
  });

  it("blocks cross-site posts and badly formed input", async () => {
    expect((await login.POST(req({ code: "MBE-E8CABF", phone: "08031234567" }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await signIn("x", "123")).status).toBe(400);
  });

  it("does not expose internals on server errors", async () => {
    delete process.env.SESSION_SECRET;
    const res = await signIn("MBE-E8CABF", "08031234567");
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("SESSION_SECRET");
  });
});

describe("/api/attempts", () => {
  const attempt = { scenarioId: "smooth", mode: "practice", mistakes: [], critical: [], completed: true, reached: 8, durationSec: 300, endReason: "Completed all 8 steps" };

  it("requires a session", async () => {
    expect((await attempts.POST(req(attempt))).status).toBe(401);
    expect((await attempts.GET()).status).toBe(401);
  });

  it("saves the score against the MBE's code, computed on the server", async () => {
    await signIn("MBE-E8CABF", "08031234567");
    const res = await attempts.POST(req({ ...attempt, mistakes: [{ code: "DATA", pts: 3, step: 3, msg: "Email didn't match." }] }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ score: 97, passed: true });
    expect(db.attempts[0]?.[0]).toBe("MBE-E8CABF");
  });

  it("rejects malformed attempts", async () => {
    await signIn("MBE-E8CABF", "08031234567");
    expect((await attempts.POST(req({ ...attempt, scenarioId: "made-up" }))).status).toBe(422);
  });
});

describe("/api/roster", () => {
  const asTrainer = () => signIn("MBE-TRAIN1", "09061234567", "trainer-passcode-1");

  it("is closed to MBEs", async () => {
    await signIn("MBE-E8CABF", "08031234567");
    expect((await roster.POST(req({ code: "MBE-X1", phone: "07031234567", name: "X Y" }))).status).toBe(403);
  });

  it("adds one MBE and updates an existing code instead of duplicating it", async () => {
    await asTrainer();
    const a = await (await roster.POST(req({ code: "mbe-new1", phone: "07031234567", name: "Kemi Lawal", store: "Lekki" }))).json();
    expect(a).toMatchObject({ added: 1, updated: 0 });
    const b = await (await roster.POST(req({ code: "MBE-NEW1", phone: "07031234568", name: "Kemi Lawal", store: "Lekki" }))).json();
    expect(b).toMatchObject({ added: 0, updated: 1 });
    expect(db.mbes.get("MBE-NEW1")?.phone).toBe("07031234568");
  });

  it("imports a pasted list and refuses a phone already used by another MBE", async () => {
    await asTrainer();
    const r = await (await roster.POST(req({ csv: "code,phone,name,store\nMBE-A1,07011111111,A One,X\nMBE-B2,08031234567,B Two,Y\nnot valid" }))).json();
    expect(r.added).toBe(1);
    expect(r.phoneTaken[0]).toMatch(/MBE-B2/);
    expect(r.errors).toHaveLength(1);
  });

  it("switches access off and on, but not the trainer's own", async () => {
    await asTrainer();
    expect((await roster.PATCH(req({ code: "MBE-E8CABF", active: false }, {}, "PATCH"))).status).toBe(200);
    expect(db.mbes.get("MBE-E8CABF")?.active).toBe(false);
    expect((await roster.PATCH(req({ code: "MBE-TRAIN1", active: false }, {}, "PATCH"))).status).toBe(422);
    expect((await roster.PATCH(req({ code: "MBE-NOPE", active: true }, {}, "PATCH"))).status).toBe(404);
  });
});
