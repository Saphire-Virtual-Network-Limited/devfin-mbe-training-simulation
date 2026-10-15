import "server-only";
import { sql } from "./db";
import { SCENARIOS } from "@/sim/scenarios";
import { MISTAKE_LABELS, type MistakeCode } from "@/sim/scoring";

/** An MBE is field-ready after passing this many situations in assessment mode. */
export const FIELD_READY_COUNT = Math.ceil(SCENARIOS.length * 0.75);

export interface TraineeSummary {
  id: string;
  name: string;
  staffCode: string;
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
  trainees: TraineeSummary[];
  topMistakes: { label: string; count: number }[];
  totalAttempts: number;
}

export async function trainerReport(includeDemo: boolean): Promise<TrainerReport> {
  const trainees = (await sql()`
    SELECT t.id, t.name, t.staff_code, t.is_demo,
           count(a.id)::int AS attempts,
           count(DISTINCT a.scenario_id) FILTER (WHERE a.mode = 'assessment' AND a.passed)::int AS passed_scenarios,
           max(a.score) FILTER (WHERE a.mode = 'assessment') AS best_assessment,
           max(a.created_at) AS last_active
    FROM trainees t
    LEFT JOIN attempts a ON a.trainee_id = t.id
    WHERE ${includeDemo} OR NOT t.is_demo
    GROUP BY t.id
    ORDER BY max(a.created_at) DESC NULLS LAST, t.name`) as {
    id: string; name: string; staff_code: string; is_demo: boolean; attempts: number;
    passed_scenarios: number; best_assessment: number | null; last_active: string | null;
  }[];

  const recent = (await sql()`
    SELECT id::text, trainee_id, title, mode, score, passed, created_at, critical, mistakes
    FROM (
      SELECT a.*, row_number() OVER (PARTITION BY trainee_id ORDER BY created_at DESC) AS rn
      FROM attempts a WHERE ${includeDemo} OR NOT a.is_demo
    ) x WHERE rn <= 20`) as {
    id: string; trainee_id: string; title: string; mode: string; score: number; passed: boolean;
    created_at: string; critical: string[]; mistakes: { pts: number; msg: string }[];
  }[];

  const mistakes = (await sql()`
    SELECT m->>'code' AS code, count(*)::int AS n
    FROM attempts a, jsonb_array_elements(a.mistakes) m
    WHERE (${includeDemo} OR NOT a.is_demo) AND a.created_at > now() - interval '90 days'
    GROUP BY 1 ORDER BY 2 DESC LIMIT 6`) as { code: string; n: number }[];

  const byTrainee = new Map<string, TraineeSummary["recent"]>();
  for (const r of recent) {
    const list = byTrainee.get(r.trainee_id) ?? [];
    list.push({
      id: r.id, title: r.title, mode: r.mode, score: r.score, passed: r.passed,
      finishedAt: new Date(r.created_at).toISOString(),
      critical: Array.isArray(r.critical) ? r.critical : [],
      mistakes: Array.isArray(r.mistakes) ? r.mistakes.map((m) => ({ pts: m.pts, msg: m.msg })) : [],
    });
    byTrainee.set(r.trainee_id, list);
  }

  return {
    trainees: trainees.map((t) => ({
      id: t.id, name: t.name, staffCode: t.staff_code, isDemo: t.is_demo, attempts: t.attempts,
      passedScenarios: t.passed_scenarios, bestAssessment: t.best_assessment,
      lastActive: t.last_active ? new Date(t.last_active).toISOString() : null,
      recent: byTrainee.get(t.id) ?? [],
    })),
    topMistakes: mistakes.map((m) => ({ label: MISTAKE_LABELS[m.code as MistakeCode] ?? m.code, count: m.n })),
    totalAttempts: trainees.reduce((s, t) => s + t.attempts, 0),
  };
}
