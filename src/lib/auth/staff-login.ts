import "server-only";

/**
 * Checks an MBE's username and password against the DevFin staff login on
 * the Platform Engine (/api/v1/staff/auth/*), the same login MBEs use in the
 * DevFin web app. Because the engine does the check on every sign-in, a
 * password change there applies here at the next sign-in, and this app never
 * stores staff passwords.
 *
 * NOT CONNECTED YET. The request and response format of the staff password
 * sign-in has not been shared with this project, and guessing it would mean
 * shipping authentication code against an unknown contract. Until the
 * Platform Engine team confirms the format, this returns "not_configured"
 * and the sign-in page says staff sign-in is unavailable. The demo login
 * works independently.
 *
 * When wiring it up:
 * - call the engine server-side only, over HTTPS, with a short timeout;
 * - never log the password or the engine's token;
 * - return the canonical engine userCode (e.g. MBE-E8CABF) as staffCode,
 *   because trainer access and score history are keyed on it;
 * - map "wrong password" and "unknown user" to the same "invalid" result so
 *   the sign-in page can't be used to discover which staff codes exist.
 */

export type StaffLoginResult =
  | { ok: true; staffCode: string; name: string }
  | { ok: false; reason: "invalid" | "not_configured" | "unavailable" };

export async function verifyStaffCredentials(username: string, password: string): Promise<StaffLoginResult> {
  void username;
  void password;
  return { ok: false, reason: "not_configured" };
}
