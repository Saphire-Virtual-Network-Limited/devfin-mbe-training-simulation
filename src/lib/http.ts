import "server-only";
import { createHash } from "node:crypto";

/** One error shape for every API response. Never includes stack traces. */
export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Cross-site request check for state-changing routes. The session cookie is
 * SameSite=Lax, and on top of that a POST must come from this site's own
 * pages (Origin matches Host) and carry JSON.
 */
export function rejectCrossSite(req: Request): Response | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      return apiError(403, "FORBIDDEN", "Request blocked.");
    }
    if (originHost !== host) return apiError(403, "FORBIDDEN", "Request blocked.");
  }
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the request as JSON.");
  }
  return null;
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("too_large");
  return JSON.parse(text) as unknown;
}

/** Client IP, hashed so raw addresses are never stored. */
export function ipKey(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/** Structured log line. Callers must never pass passwords, tokens or cookies. */
export function logEvent(event: string, fields: Record<string, string | number | boolean>): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}
