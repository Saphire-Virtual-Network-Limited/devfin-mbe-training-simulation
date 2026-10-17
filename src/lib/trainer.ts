import "server-only";
import { sql } from "./db";
import { SCENARIOS } from "@/sim/scenarios";
import { MISTAKE_LABELS, type MistakeCode } from "@/sim/scoring";

/** An MBE is field-ready after passing this many situations in assessment mode. */
export const FIELD_READY_COUNT = Math.ceil(SCENARIOS.length * 0.75);

export interface MbeSummary {
  code: string;
  phone: string;
  name: string;
  store: string;
  active: boolean;
  isDemo: boolean;
  attempts: number;
  passedScenarios: number;
  bestAssessment: number | null;
  lastActive: string | null;
  recent: {
    id: string;
    title: string;
    mode: string;
    score: number;
    passed: boolean;
    finishedAt: string;
    critical: string[];
    mistakes: { pts: number; msg: string }[];
  }[];
}

export interface TrainerReport {
  mbes: MbeSummary[];
  topMistakes: { label: string; count: number }[];
  totalAttempts: number;
}

export async function trainerReport(includeDemo: boolean): Promise<TrainerReport> {
  const mbes = (await sql()`
    SELECT m.code, m.phone, m.name, m.store, m.active, m.is_demo,
           count(a.id)::int AS attempts,
           count(DISTINCT a.scenario_id) FILTER (WHERE a.mode = 'assessment' AND a.passed)::int AS passed_scenarios,
           max(a.score) FILTER (WHERE a.mode = 'assessment') AS best_assessment,
           max(a.created_at) AS last_active
    FROM mbes m
    LEFT JOIN attempts a ON a.mbe_code = m.code
    WHERE ${includeDemo} OR NOT m.is_demo
    GROUP BY m.code
    ORDER BY max(a.created_at) DESC NULLS LAST, m.name`) as {
    code: string; phone: string; name: string; store: string; active: boolean; is_demo: boolean; attempts: number;
    passed_scenarios: number; best_assessment: number | null; last_active: string | null;
  }[];

  const recent = (await sql()`
    SELECT id::text, mbe_code, title, mode, score, passed, created_at, critical, mistakes
    FROM (
      SELECT a.*, row_number() OVER (PARTITION BY mbe_code ORDER BY created_at DESC) AS rn
      FROM attempts a WHERE ${includeDemo} OR NOT a.is_demo
    ) x WHERE rn <= 20`) as {
    id: string; mbe_code: string; title: string; mode: string; score: number; passed: boolean;
    created_at: string; critical: string[]; mistakes: { pts: number; msg: string }[];
  }[];

  const mistakes = (await sql()`
    SELECT m->>'code' AS code, count(*)::int AS n
    FROM attempts a, jsonb_array_elements(a.mistakes) m
    WHERE (${includeDemo} OR NOT a.is_demo) AND a.created_at > now() - interval '90 days'
    GROUP BY 1 ORDER BY 2 DESC LIMIT 6`) as { code: string; n: number }[];

  const byMbe = new Map<string, MbeSummary["recent"]>();
  for (const r of recent) {
    const list = byMbe.get(r.mbe_code) ?? [];
    list.push({
      id: r.id, title: r.title, mode: r.mode, score: r.score, passed: r.passed,
      finishedAt: new Date(r.created_at).toISOString(),
      critical: Array.isArray(r.critical) ? r.critical : [],
      mistakes: Array.isArray(r.mistakes) ? r.mistakes.map((m) => ({ pts: m.pts, msg: m.msg })) : [],
    });
    byMbe.set(r.mbe_code, list);
  }

  return {
    mbes: mbes.map((m) => ({
      code: m.code, phone: m.phone, name: m.name, store: m.store, active: m.active, isDemo: m.is_demo,
      attempts: m.attempts, passedScenarios: m.passed_scenarios, bestAssessment: m.best_assessment,
      lastActive: m.last_active ? new Date(m.last_active).toISOString() : null,
      recent: byMbe.get(m.code) ?? [],
    })),
    topMistakes: mistakes.map((m) => ({ label: MISTAKE_LABELS[m.code as MistakeCode] ?? m.code, count: m.n })),
    totalAttempts: mbes.reduce((s, m) => s + m.attempts, 0),
  };
}
