import "server-only";

/**
 * Server configuration, read once per request path that needs it. Missing
 * required values fail closed: sign-in is refused rather than running with
 * an insecure default.
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
  username: string;
  passwordHash: string;
  role: "mbe" | "trainer";
}

/** The always-available test login. Off unless every value is set. */
export function demoConfig(): DemoConfig | null {
  if (process.env.DEMO_LOGIN_ENABLED !== "true") return null;
  const username = (process.env.DEMO_LOGIN_USERNAME ?? "").trim().toLowerCase();
  const passwordHash = process.env.DEMO_LOGIN_PASSWORD_HASH ?? "";
  if (!username || !passwordHash) return null;
  return { username, passwordHash, role: process.env.DEMO_LOGIN_ROLE === "trainer" ? "trainer" : "mbe" };
}

/** Staff codes (e.g. MBE-E8CABF) allowed into the trainer view. */
export function trainerCodes(): Set<string> {
  return new Set(
    (process.env.TRAINER_STAFF_CODES ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
}
