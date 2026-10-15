import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed session token: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 *
 * Security decisions:
 * - Signed, not encrypted: the payload holds only a staff code, display name
 *   and role, nothing secret. It cannot be altered without the server secret.
 * - Signature compared in constant time.
 * - Expiry is inside the signed payload, so an old cookie stops working even
 *   if the browser keeps it.
 *
 * Kept free of Next.js imports so it can be unit tested on its own.
 */

export interface SessionUser {
  /** Stable id used as the database key, e.g. "staff:MBE-E8CABF" or "demo:demo". */
  id: string;
  name: string;
  staffCode: string;
  role: "mbe" | "trainer";
  demo: boolean;
}

interface Payload extends SessionUser {
  exp: number;
}

const b64 = (b: Buffer) => b.toString("base64url");

export function signToken(user: SessionUser, secret: string, ttlSec: number, now = Date.now()): string {
  const payload: Payload = { ...user, exp: Math.floor(now / 1000) + ttlSec };
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const sig = b64(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token: string | undefined, secret: string, now = Date.now()): SessionUser | null {
  if (!token || token.length > 4096) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let p: Partial<Payload>;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<Payload>;
  } catch {
    return null;
  }
  if (typeof p.exp !== "number" || p.exp * 1000 <= now) return null;
  if (typeof p.id !== "string" || typeof p.name !== "string" || typeof p.staffCode !== "string") return null;
  if (p.role !== "mbe" && p.role !== "trainer") return null;
  return { id: p.id, name: p.name, staffCode: p.staffCode, role: p.role, demo: p.demo === true };
}
