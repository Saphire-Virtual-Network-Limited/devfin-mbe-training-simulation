import "server-only";
import { sql } from "./db";
import type { RosterEntry } from "./mbe-id";

export interface UpsertResult {
  added: number;
  updated: number;
  /** Codes not saved because their phone number already belongs to another MBE. */
  phoneTaken: string[];
}

/**
 * Adds MBEs, or updates the phone, name and store of existing ones (matched
 * by code). A phone number may belong to only one active MBE, so a typo can't
 * let one person sign in as two. Never deletes anything.
 */
export async function upsertMbes(entries: RosterEntry[]): Promise<UpsertResult> {
  const result: UpsertResult = { added: 0, updated: 0, phoneTaken: [] };
  for (const e of entries) {
    const clash = (await sql()`
      SELECT code FROM mbes WHERE phone = ${e.phone} AND code <> ${e.code} AND active AND NOT is_demo LIMIT 1`) as { code: string }[];
    if (clash.length) {
      result.phoneTaken.push(`${e.code} (phone already used by ${clash[0].code})`);
      continue;
    }
    const rows = (await sql()`
      INSERT INTO mbes (code, phone, name, store)
      VALUES (${e.code}, ${e.phone}, ${e.name}, ${e.store})
      ON CONFLICT (code) DO UPDATE
        SET phone = EXCLUDED.phone, name = EXCLUDED.name, store = EXCLUDED.store, updated_at = now()
      RETURNING (xmax = 0) AS inserted`) as { inserted: boolean }[];
    if (rows[0]?.inserted) result.added++;
    else result.updated++;
  }
  return result;
}

/** Switching an MBE off keeps their history but stops new sign-ins. */
export async function setActive(code: string, active: boolean): Promise<boolean> {
  const rows = (await sql()`
    UPDATE mbes SET active = ${active}, updated_at = now() WHERE code = ${code} AND NOT is_demo RETURNING code`) as { code: string }[];
  return rows.length === 1;
}
