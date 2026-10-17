import "server-only";
import { sql } from "./db";
import type { ScoredAttempt } from "@/sim/attempt";
import type { SavedAttempt } from "@/sim/app";
import type { SessionUser } from "./auth/token";

/** Generous ceiling that stops a runaway script, not a keen trainee. */
export const DAILY_ATTEMPT_LIMIT = 300;

export async function attemptsToday(mbeCode: string): Promise<number> {
  const rows = (await sql()`
    SELECT count(*)::int AS n FROM attempts WHERE mbe_code = ${mbeCode} AND created_at > now() - interval '1 day'`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export async function insertAttempt(user: SessionUser, a: ScoredAttempt): Promise<void> {
  await sql()`
    INSERT INTO attempts (mbe_code, scenario_id, title, level, mode, score, passed, completed, reached,
                          duration_sec, end_reason, mistakes, critical, is_demo)
    VALUES (${user.id}, ${a.scenarioId}, ${a.title}, ${a.level}, ${a.mode}, ${a.score}, ${a.passed}, ${a.completed},
            ${a.reached}, ${a.durationSec}, ${a.endReason}, ${JSON.stringify(a.mistakes)}::jsonb,
            ${JSON.stringify(a.critical)}::jsonb, ${user.demo})`;
}

interface AttemptRow {
  id: string;
  scenario_id: string;
  title: string;
  mode: "practice" | "assessment";
  score: number;
  passed: boolean;
  critical: string[];
  duration_sec: number;
  created_at: string;
}

export async function listOwnAttempts(mbeCode: string, limit = 200): Promise<SavedAttempt[]> {
  const rows = (await sql()`
    SELECT id::text, scenario_id, title, mode, score, passed, critical, duration_sec, created_at
    FROM attempts WHERE mbe_code = ${mbeCode}
    ORDER BY created_at DESC LIMIT ${limit}`) as AttemptRow[];
  return rows.map((r) => ({
    id: r.id,
    scenarioId: r.scenario_id,
    title: r.title,
    mode: r.mode,
    score: r.score,
    passed: r.passed,
    critical: Array.isArray(r.critical) ? r.critical : [],
    durationSec: r.duration_sec,
    finishedAt: new Date(r.created_at).toISOString(),
  }));
}
