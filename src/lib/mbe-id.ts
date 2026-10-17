/**
 * How MBE codes and phone numbers are cleaned before they are stored or
 * compared, so "mbe-e8cabf" and "MBE-E8CABF", or "+234 803 123 4567" and
 * "08031234567", are treated as the same thing.
 *
 * Pure functions: shared by the sign-in route, the roster API, the import
 * script and the tests.
 */

/** Uppercase letters, digits and dashes, 3 to 24 characters, e.g. MBE-E8CABF. */
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,23}$/;

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase().replace(/\s+/g, "");
  return CODE_RE.test(code) ? code : null;
}

/**
 * Nigerian mobile numbers in the local 11-digit form (0XXXXXXXXXX).
 * Accepts +234 / 234 prefixes, spaces and dashes.
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let d = raw.replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith("234") && d.length === 13) d = "0" + d.slice(3);
  return /^0[789]\d{9}$/.test(d) ? d : null;
}

export interface RosterEntry {
  code: string;
  phone: string;
  name: string;
  store: string;
}

export type RosterParse = { entries: RosterEntry[]; errors: string[] };

const cleanText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

export function validateEntry(raw: { code?: unknown; phone?: unknown; name?: unknown; store?: unknown }, label: string): RosterEntry | string {
  const code = normalizeCode(raw.code);
  if (!code) return `${label}: the MBE code must be 3 to 24 letters, numbers or dashes.`;
  const phone = normalizePhone(raw.phone);
  if (!phone) return `${label}: the phone number must be a Nigerian mobile number, e.g. 08031234567.`;
  const name = cleanText(raw.name, 80);
  if (name.length < 2) return `${label}: add the MBE's name.`;
  return { code, phone, name, store: cleanText(raw.store, 80) };
}

/**
 * Parses pasted or uploaded lines of "code, phone, name, store".
 * A header row is skipped. Each code may appear once.
 */
export function parseRosterCsv(text: string, maxRows = 500): RosterParse {
  const entries: RosterEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const cells = line.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (i === 0 && /code/i.test(cells[0] ?? "") && /phone/i.test(cells[1] ?? "")) return;
    if (entries.length + errors.length >= maxRows) return;
    const r = validateEntry({ code: cells[0], phone: cells[1], name: cells[2], store: cells[3] }, `Line ${i + 1}`);
    if (typeof r === "string") return void errors.push(r);
    if (seen.has(r.code)) return void errors.push(`Line ${i + 1}: ${r.code} appears more than once.`);
    seen.add(r.code);
    entries.push(r);
  });
  if (lines.length > maxRows + 1) errors.push(`Only the first ${maxRows} rows were read. Add the rest in another batch.`);
  return { entries, errors };
}
