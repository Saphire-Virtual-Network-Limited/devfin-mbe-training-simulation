// Creates the app's tables. Additive only and safe to re-run: it never drops
// or rewrites existing data.
// Usage: npm run migrate   (reads DATABASE_URL from .env.local)
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = neon(url);

// The MBE roster. Sign-in matches code + phone against this table, and every
// score is linked to the MBE through `code`.
await sql`
  CREATE TABLE IF NOT EXISTS mbes (
    code        TEXT PRIMARY KEY,
    phone       TEXT NOT NULL,
    name        TEXT NOT NULL,
    store       TEXT NOT NULL DEFAULT '',
    active      BOOLEAN NOT NULL DEFAULT true,
    is_demo     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen   TIMESTAMPTZ
  )`;

await sql`
  CREATE TABLE IF NOT EXISTS attempts (
    id           BIGSERIAL PRIMARY KEY,
    mbe_code     TEXT NOT NULL REFERENCES mbes(code) ON UPDATE CASCADE,
    scenario_id  TEXT NOT NULL,
    title        TEXT NOT NULL,
    level        TEXT NOT NULL,
    mode         TEXT NOT NULL CHECK (mode IN ('practice', 'assessment')),
    score        INT NOT NULL CHECK (score BETWEEN 0 AND 100),
    passed       BOOLEAN NOT NULL,
    completed    BOOLEAN NOT NULL,
    reached      INT NOT NULL CHECK (reached BETWEEN 1 AND 8),
    duration_sec INT NOT NULL CHECK (duration_sec >= 0),
    end_reason   TEXT NOT NULL,
    mistakes     JSONB NOT NULL DEFAULT '[]'::jsonb,
    critical     JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_demo      BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
await sql`CREATE INDEX IF NOT EXISTS attempts_mbe_idx ON attempts (mbe_code, created_at DESC)`;
await sql`CREATE INDEX IF NOT EXISTS attempts_created_idx ON attempts (created_at DESC)`;

await sql`
  CREATE TABLE IF NOT EXISTS login_failures (
    id   BIGSERIAL PRIMARY KEY,
    key  TEXT NOT NULL,
    at   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
await sql`CREATE INDEX IF NOT EXISTS login_failures_key_idx ON login_failures (key, at DESC)`;

console.log("migrations applied");
