import "server-only";
import { demoConfig, trainerCodes } from "../env";
import { sql } from "../db";
import { verifyPassword } from "./password";
import { verifyStaffCredentials } from "./staff-login";
import type { SessionUser } from "./token";

export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; status: number; code: string; message: string };

const WINDOW_MIN = 15;
const MAX_FAILS_PER_USER = 5;
const MAX_FAILS_PER_IP = 20;

const INVALID: LoginResult = { ok: false, status: 401, code: "INVALID_CREDENTIALS", message: "That username and password don't match. Check them and try again." };

/**
 * Lockout is stored in the database, not memory, because serverless
 * instances don't share memory. Only a hash of the IP is stored.
 */
async function tooManyFailures(userKey: string, ipKey: string): Promise<boolean> {
  const rows = (await sql()`
    SELECT
      count(*) FILTER (WHERE key = ${"u:" + userKey})::int AS user_fails,
      count(*) FILTER (WHERE key = ${"ip:" + ipKey})::int AS ip_fails
    FROM login_failures
    WHERE at > now() - make_interval(mins => ${WINDOW_MIN})`) as { user_fails: number; ip_fails: number }[];
  const r = rows[0];
  return (r?.user_fails ?? 0) >= MAX_FAILS_PER_USER || (r?.ip_fails ?? 0) >= MAX_FAILS_PER_IP;
}

async function recordFailure(userKey: string, ipKey: string): Promise<void> {
  await sql()`INSERT INTO login_failures (key) VALUES (${"u:" + userKey}), (${"ip:" + ipKey})`;
  // Keep the table small; old rows no longer affect lockout.
  await sql()`DELETE FROM login_failures WHERE at < now() - interval '1 day'`;
}

export async function authenticate(usernameRaw: string, password: string, ipKey: string): Promise<LoginResult> {
  const username = usernameRaw.trim();
  const userKey = username.toLowerCase();
  if (!username || !password || username.length > 120 || password.length > 200) return INVALID;

  if (await tooManyFailures(userKey, ipKey)) {
    return { ok: false, status: 429, code: "TOO_MANY_ATTEMPTS", message: `Too many failed sign-ins. Wait ${WINDOW_MIN} minutes and try again.` };
  }

  const demo = demoConfig();
  if (demo && userKey === demo.username) {
    if (await verifyPassword(password, demo.passwordHash)) {
      return { ok: true, user: { id: `demo:${demo.username}`, name: "Demo trainee", staffCode: "DEMO", role: demo.role, demo: true } };
    }
    await recordFailure(userKey, ipKey);
    return INVALID;
  }

  const staff = await verifyStaffCredentials(username, password);
  if (staff.ok) {
    const code = staff.staffCode.toUpperCase();
    return {
      ok: true,
      user: { id: `staff:${code}`, name: staff.name, staffCode: code, role: trainerCodes().has(code) ? "trainer" : "mbe", demo: false },
    };
  }
  if (staff.reason === "not_configured") {
    return { ok: false, status: 503, code: "STAFF_LOGIN_UNAVAILABLE", message: "Staff sign-in isn't connected yet. Ask your trainer for the demo login." };
  }
  if (staff.reason === "unavailable") {
    return { ok: false, status: 503, code: "STAFF_LOGIN_UNAVAILABLE", message: "The DevFin staff login isn't responding. Try again in a few minutes." };
  }
  await recordFailure(userKey, ipKey);
  return INVALID;
}

export async function recordSignIn(user: SessionUser): Promise<void> {
  await sql()`
    INSERT INTO trainees (id, name, staff_code, is_demo)
    VALUES (${user.id}, ${user.name}, ${user.staffCode}, ${user.demo})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, last_seen = now()`;
}
