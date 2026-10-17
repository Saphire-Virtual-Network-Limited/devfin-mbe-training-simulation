import "server-only";
import { normalizeCode, normalizePhone } from "./mbe-id";

/**
 * Server configuration. Missing required values fail closed: sign-in is
 * refused rather than running with an insecure default.
 */

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random value of at least 32 characters.");
  }
  return s;
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return url;
}

export interface DemoConfig {
  code: string;
  phone: string;
}

/**
 * The always-available test login: an MBE code and phone number that aren't
 * a real MBE. It can only practise; it never gets the trainer view.
 */
export function demoConfig(): DemoConfig | null {
  if (process.env.DEMO_LOGIN_ENABLED !== "true") return null;
  const code = normalizeCode(process.env.DEMO_MBE_CODE);
  const phone = normalizePhone(process.env.DEMO_MBE_PHONE);
  return code && phone ? { code, phone } : null;
}

/** MBE codes (e.g. MBE-E8CABF) allowed into the trainer view. */
export function trainerCodes(): Set<string> {
  return new Set(
    (process.env.TRAINER_CODES ?? "")
      .split(",")
      .map((s) => normalizeCode(s))
      .filter((s): s is string => s !== null),
  );
}

/** scrypt hash of the passcode trainers enter on top of code and phone. */
export function trainerPasscodeHash(): string | null {
  return process.env.TRAINER_PASSCODE_HASH || null;
}
