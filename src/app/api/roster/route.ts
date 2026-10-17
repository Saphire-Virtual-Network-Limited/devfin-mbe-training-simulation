import { getSession } from "@/lib/auth/session";
import { apiError, logEvent, readJson, rejectCrossSite } from "@/lib/http";
import { normalizeCode, parseRosterCsv, validateEntry, type RosterEntry } from "@/lib/mbe-id";
import { setActive, upsertMbes } from "@/lib/roster";

async function requireTrainer(req: Request) {
  const blocked = rejectCrossSite(req);
  if (blocked) return { error: blocked };
  const user = await getSession();
  if (!user) return { error: apiError(401, "UNAUTHENTICATED", "Sign in again.") };
  if (user.role !== "trainer") return { error: apiError(403, "FORBIDDEN", "Only trainers can change the MBE list.") };
  return { user };
}

async function body(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await readJson(req, 200 * 1024);
    return typeof b === "object" && b !== null ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Add or update MBEs: either one ({ code, phone, name, store }) or a pasted list ({ csv }). */
export async function POST(req: Request) {
  const auth = await requireTrainer(req);
  if (auth.error) return auth.error;
  const b = await body(req);
  if (!b) return apiError(400, "BAD_REQUEST", "Send the MBE details as JSON.");

  let entries: RosterEntry[];
  let errors: string[] = [];
  if (typeof b.csv === "string") {
    const parsed = parseRosterCsv(b.csv);
    entries = parsed.entries;
    errors = parsed.errors;
  } else {
    const one = validateEntry(b, "MBE");
    if (typeof one === "string") return apiError(422, "INVALID_MBE", one);
    entries = [one];
  }
  if (!entries.length) return apiError(422, "INVALID_MBE", errors[0] ?? "No MBEs to add.");

  try {
    const result = await upsertMbes(entries);
    logEvent("roster_upsert", { by: auth.user.id, added: result.added, updated: result.updated, skipped: result.phoneTaken.length });
    return Response.json({ ok: true, ...result, errors });
  } catch (err) {
    logEvent("roster_error", { message: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    return apiError(500, "SERVER_ERROR", "The MBE list couldn't be saved. Try again in a minute.");
  }
}

/** Switch an MBE on or off: { code, active }. */
export async function PATCH(req: Request) {
  const auth = await requireTrainer(req);
  if (auth.error) return auth.error;
  const b = await body(req);
  const code = normalizeCode(b?.code);
  if (!code || typeof b?.active !== "boolean") return apiError(400, "BAD_REQUEST", "Send an MBE code and active: true or false.");
  if (code === auth.user.id && b.active === false) return apiError(422, "SELF_DEACTIVATE", "You can't switch off your own access.");
  try {
    if (!(await setActive(code, b.active))) return apiError(404, "NOT_FOUND", "No MBE with that code.");
    logEvent("roster_active", { by: auth.user.id, mbe: code, active: b.active });
    return Response.json({ ok: true });
  } catch (err) {
    logEvent("roster_error", { message: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    return apiError(500, "SERVER_ERROR", "That change couldn't be saved. Try again in a minute.");
  }
}
