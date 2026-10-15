import { attemptsToday, DAILY_ATTEMPT_LIMIT, insertAttempt, listOwnAttempts } from "@/lib/attempts";
import { getSession } from "@/lib/auth/session";
import { apiError, logEvent, readJson, rejectCrossSite } from "@/lib/http";
import { parseAttempt } from "@/sim/attempt";

export async function GET() {
  const user = await getSession();
  if (!user) return apiError(401, "UNAUTHENTICATED", "Sign in again to see your results.");
  try {
    return Response.json({ attempts: await listOwnAttempts(user.id) });
  } catch (err) {
    logEvent("attempts_list_error", { message: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    return apiError(500, "SERVER_ERROR", "Your results couldn't be loaded. Try again in a minute.");
  }
}

export async function POST(req: Request) {
  const blocked = rejectCrossSite(req);
  if (blocked) return blocked;
  const user = await getSession();
  if (!user) return apiError(401, "UNAUTHENTICATED", "Your session ended. Sign in again; this attempt was not saved.");

  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return apiError(400, "BAD_REQUEST", "The attempt data was not valid JSON.");
  }
  const parsed = parseAttempt(body);
  if (!parsed.ok) return apiError(422, "INVALID_ATTEMPT", parsed.message);

  try {
    if ((await attemptsToday(user.id)) >= DAILY_ATTEMPT_LIMIT) {
      return apiError(429, "DAILY_LIMIT", "You've reached today's attempt limit. Try again tomorrow.");
    }
    await insertAttempt(user, parsed.value);
    return Response.json({ ok: true, score: parsed.value.score, passed: parsed.value.passed }, { status: 201 });
  } catch (err) {
    logEvent("attempt_save_error", { user: user.id, message: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    return apiError(500, "SERVER_ERROR", "The attempt couldn't be saved. Try again in a minute.");
  }
}
