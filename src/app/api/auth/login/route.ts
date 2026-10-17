import { authenticate, recordSignIn } from "@/lib/auth/login";
import { startSession } from "@/lib/auth/session";
import { apiError, ipKey, logEvent, readJson, rejectCrossSite } from "@/lib/http";
import { normalizePhone } from "@/lib/mbe-id";

export async function POST(req: Request) {
  const blocked = rejectCrossSite(req);
  if (blocked) return blocked;

  let body: Record<string, unknown>;
  try {
    const parsed = await readJson(req, 4096);
    body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return apiError(400, "BAD_REQUEST", "Send your MBE code and phone number.");
  }

  try {
    const ip = ipKey(req);
    const result = await authenticate({ code: body.code, phone: body.phone, passcode: body.passcode }, ip);
    if (!result.ok) {
      // PASSCODE_REQUIRED is the normal second step for trainers, not a failure worth logging.
      if (result.code !== "PASSCODE_REQUIRED") logEvent("login_failed", { code: result.code, ip });
      return apiError(result.status, result.code, result.message);
    }
    await recordSignIn(result.user, normalizePhone(body.phone) ?? "");
    await startSession(result.user);
    logEvent("login_ok", { mbe: result.user.id, role: result.user.role });
    return Response.json({ ok: true });
  } catch (err) {
    logEvent("login_error", { message: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    return apiError(500, "SERVER_ERROR", "Sign-in failed on our side. Try again in a minute.");
  }
}
