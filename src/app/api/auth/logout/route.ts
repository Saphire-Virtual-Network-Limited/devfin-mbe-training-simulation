import { endSession } from "@/lib/auth/session";
import { rejectCrossSite } from "@/lib/http";

export async function POST(req: Request) {
  const blocked = rejectCrossSite(req);
  if (blocked) return blocked;
  await endSession();
  return Response.json({ ok: true });
}
