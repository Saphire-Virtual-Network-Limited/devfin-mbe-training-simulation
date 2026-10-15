import "server-only";
import { cookies } from "next/headers";
import { sessionSecret } from "../env";
import { signToken, verifyToken, type SessionUser } from "./token";

export type { SessionUser };

const COOKIE = "dfp_session";
/** Twelve hours: one working day. A staff password change takes effect at the next sign-in. */
export const SESSION_TTL_SEC = 12 * 60 * 60;

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return verifyToken(token, sessionSecret());
}

export async function startSession(user: SessionUser): Promise<void> {
  (await cookies()).set(COOKIE, signToken(user, sessionSecret(), SESSION_TTL_SEC), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
