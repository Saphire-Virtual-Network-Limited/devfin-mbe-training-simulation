// Creates the app's tables. Additive only and safe to re-run: it never drops
// or rewrites existing data.
// Usage: npm run migrate   (reads DATABASE_URL from .env.local)
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = neon(url);

await sql`
  CREATE TABLE IF NOT EXISTS trainees (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    staff_code  TEXT NOT NULL,
    is_demo     BOOLEAN NOT NULL DEFAULT false,
    first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

await sql`
  CREATE TABLE IF NOT EXISTS attempts (
    id           BIGSERIAL PRIMARY KEY,
    trainee_id   TEXT NOT NULL REFERENCES trainees(id),
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
await sql`CREATE INDEX IF NOT EXISTS attempts_trainee_idx ON attempts (trainee_id, created_at DESC)`;
await sql`CREATE INDEX IF NOT EXISTS attempts_created_idx ON attempts (created_at DESC)`;

await sql`
  CREATE TABLE IF NOT EXISTS login_failures (
    id   BIGSERIAL PRIMARY KEY,
    key  TEXT NOT NULL,
    at   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
await sql`CREATE INDEX IF NOT EXISTS login_failures_key_idx ON login_failures (key, at DESC)`;

console.log("migrations applied");
