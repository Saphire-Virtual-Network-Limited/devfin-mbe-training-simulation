// Loads MBEs from a CSV file into the roster: code, phone, name, store.
// Existing codes are updated, never duplicated. Nothing is deleted.
// Use it for the first load (including the first trainer); after that,
// trainers can add MBEs from the Trainer view.
//
// Usage: npm run import-mbes -- path/to/mbes.csv
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { parseRosterCsv } from "../src/lib/mbe-id.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run import-mbes -- path/to/mbes.csv");
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = neon(url);

const { entries, errors } = parseRosterCsv(readFileSync(file, "utf8"), 5000);
errors.forEach((e) => console.warn("skipped:", e));

let added = 0, updated = 0, clashes = 0;
for (const e of entries) {
  const clash = await sql`SELECT code FROM mbes WHERE phone = ${e.phone} AND code <> ${e.code} AND active AND NOT is_demo LIMIT 1`;
  if (clash.length) {
    console.warn(`skipped: ${e.code} — phone already used by ${clash[0].code}`);
    clashes++;
    continue;
  }
  const [row] = await sql`
    INSERT INTO mbes (code, phone, name, store) VALUES (${e.code}, ${e.phone}, ${e.name}, ${e.store})
    ON CONFLICT (code) DO UPDATE SET phone = EXCLUDED.phone, name = EXCLUDED.name, store = EXCLUDED.store, updated_at = now()
    RETURNING (xmax = 0) AS inserted`;
  if (row.inserted) added++;
  else updated++;
}
console.log(`${added} added, ${updated} updated, ${clashes + errors.length} skipped`);
