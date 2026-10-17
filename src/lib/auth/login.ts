import "server-only";
import { demoConfig, trainerCodes, trainerPasscodeHash } from "../env";
import { sql } from "../db";
import { normalizeCode, normalizePhone } from "../mbe-id";
import { verifyPassword } from "./password";
import type { SessionUser } from "./token";

/**
 * Sign-in with MBE code + phone number, matched against the MBE roster.
 *
 * Security decisions:
 * - Code + phone identifies an MBE; it is not a secret like a password.
 *   That fits a training tool where the risk is a colleague doing someone
 *   else's test, not money or customer data moving. Each code is bound to
 *   one phone, and only codes on the roster can sign in.
 * - Trainers can change the roster and see everyone's results, so they must
 *   also enter a trainer passcode (stored only as a scrypt hash).
 * - Wrong code and wrong phone give the same message, so the sign-in page
 *   can't be used to find out which codes or phones exist.
 * - 5 failures per code or 20 per IP in 15 minutes locks sign-in for that
 *   window. Counts live in Postgres (serverless instances don't share
 *   memory). Only a hash of the IP is stored.
 */

export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; status: number; code: string; message: string };

const WINDOW_MIN = 15;
const MAX_FAILS_PER_CODE = 5;
const MAX_FAILS_PER_IP = 20;

const NO_MATCH: LoginResult = {
  ok: false,
  status: 401,
  code: "NO_MATCH",
  message: "That MBE code and phone number don't match our list. Check both, or ask your trainer to add you.",
};

async function tooManyFailures(codeKey: string, ipKey: string): Promise<boolean> {
  const rows = (await sql()`
    SELECT
      count(*) FILTER (WHERE key = ${"c:" + codeKey})::int AS code_fails,
      count(*) FILTER (WHERE key = ${"ip:" + ipKey})::int AS ip_fails
    FROM login_failures
    WHERE at > now() - make_interval(mins => ${WINDOW_MIN})`) as { code_fails: number; ip_fails: number }[];
  const r = rows[0];
  return (r?.code_fails ?? 0) >= MAX_FAILS_PER_CODE || (r?.ip_fails ?? 0) >= MAX_FAILS_PER_IP;
}

async function recordFailure(codeKey: string, ipKey: string): Promise<void> {
  await sql()`INSERT INTO login_failures (key) VALUES (${"c:" + codeKey}), (${"ip:" + ipKey})`;
  await sql()`DELETE FROM login_failures WHERE at < now() - interval '1 day'`;
}

export interface LoginInput {
  code: unknown;
  phone: unknown;
  passcode?: unknown;
}

export async function authenticate(input: LoginInput, ipKey: string): Promise<LoginResult> {
  const code = normalizeCode(input.code);
  const phone = normalizePhone(input.phone);
  if (!code || !phone) {
    return { ok: false, status: 400, code: "BAD_FORMAT", message: "Enter your MBE code (e.g. MBE-E8CABF) and your 11-digit phone number." };
  }

  if (await tooManyFailures(code, ipKey)) {
    return { ok: false, status: 429, code: "TOO_MANY_ATTEMPTS", message: `Too many failed sign-ins. Wait ${WINDOW_MIN} minutes and try again.` };
  }

  const demo = demoConfig();
  if (demo && code === demo.code) {
    if (phone !== demo.phone) {
      await recordFailure(code, ipKey);
      return NO_MATCH;
    }
    return { ok: true, user: { id: code, name: "Demo trainee", staffCode: code, role: "mbe", demo: true } };
  }

  const rows = (await sql()`SELECT code, phone, name, active FROM mbes WHERE code = ${code}`) as {
    code: string; phone: string; name: string; active: boolean;
  }[];
  const mbe = rows[0];
  if (!mbe || mbe.phone !== phone) {
    await recordFailure(code, ipKey);
    return NO_MATCH;
  }
  if (!mbe.active) {
    return { ok: false, status: 403, code: "DEACTIVATED", message: "Your access to the practice lab has been switched off. Speak to your trainer." };
  }

  const isTrainer = trainerCodes().has(code);
  if (isTrainer) {
    const hash = trainerPasscodeHash();
    const passcode = typeof input.passcode === "string" ? input.passcode : "";
    if (!hash) {
      return { ok: false, status: 503, code: "TRAINER_SETUP", message: "Trainer sign-in isn't set up yet (TRAINER_PASSCODE_HASH is missing)." };
    }
    if (!passcode) {
      return { ok: false, status: 401, code: "PASSCODE_REQUIRED", message: "You're a trainer. Enter the trainer passcode as well." };
    }
    if (passcode.length > 200 || !(await verifyPassword(passcode, hash))) {
      await recordFailure(code, ipKey);
      return { ok: false, status: 401, code: "BAD_PASSCODE", message: "That trainer passcode isn't right." };
    }
  }

  return { ok: true, user: { id: code, name: mbe.name, staffCode: code, role: isTrainer ? "trainer" : "mbe", demo: false } };
}

/** Keeps last sign-in time, and creates the demo account's row so its attempts have an owner. */
export async function recordSignIn(user: SessionUser, phone: string): Promise<void> {
  if (user.demo) {
    await sql()`
      INSERT INTO mbes (code, phone, name, store, is_demo)
      VALUES (${user.id}, ${phone}, ${user.name}, 'Demo', true)
      ON CONFLICT (code) DO UPDATE SET last_seen = now()`;
    return;
  }
  await sql()`UPDATE mbes SET last_seen = now() WHERE code = ${user.id}`;
}
