import { authenticate, recordSignIn } from "@/lib/auth/login";
import { startSession } from "@/lib/auth/session";
import { apiError, ipKey, logEvent, readJson, rejectCrossSite } from "@/lib/http";

export async function POST(req: Request) {
  const blocked = rejectCrossSite(req);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await readJson(req, 4096);
  } catch {
    return apiError(400, "BAD_REQUEST", "Send your username and password.");
  }
  const { username, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof username !== "string" || typeof password !== "string") {
    return apiError(400, "BAD_REQUEST", "Send your username and password.");
  }

  try {
    const ip = ipKey(req);
    const result = await authenticate(username, password, ip);
    if (!result.ok) {
      logEvent("login_failed", { code: result.code, ip });
      return apiError(result.status, result.code, result.message);
    }
    await recordSignIn(result.user);
    await startSession(result.user);
    logEvent("login_ok", { user: result.user.id, role: result.user.role });
    return Response.json({ ok: true });
  } catch (err) {
    logEvent("login_error", { message: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    return apiError(500, "SERVER_ERROR", "Sign-in failed on our side. Try again in a minute.");
  }
}
