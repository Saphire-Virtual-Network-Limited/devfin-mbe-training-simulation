import { findScenario } from "./scenarios";
import { isPassed, MISTAKE_CODES, scoreFrom, type Mistake, type MistakeCode } from "./scoring";

/** What the browser sends when a run ends. Score and pass/fail are not part
 * of it: the server works them out from the mistakes. */
export interface AttemptInput {
  scenarioId: string;
  mode: "practice" | "assessment";
  mistakes: Mistake[];
  critical: string[];
  completed: boolean;
  reached: number;
  durationSec: number;
  endReason: string;
}

export interface ScoredAttempt extends AttemptInput {
  title: string;
  level: string;
  score: number;
  passed: boolean;
}

export type ParseResult = { ok: true; value: ScoredAttempt } | { ok: false; message: string };

const MAX_MISTAKES = 80;
const MAX_CRITICAL = 10;
const MAX_DURATION_SEC = 4 * 60 * 60;

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

/**
 * Validates an untrusted attempt body and scores it. Everything from the
 * browser is treated as untrusted input: unknown fields are dropped,
 * every field is type- and range-checked, and score/pass are recomputed.
 */
export function parseAttempt(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) return { ok: false, message: "Body must be a JSON object." };
  const b = body as Record<string, unknown>;

  const scenario = typeof b.scenarioId === "string" ? findScenario(b.scenarioId) : undefined;
  if (!scenario) return { ok: false, message: "Unknown scenario." };
  if (b.mode !== "practice" && b.mode !== "assessment") return { ok: false, message: "Mode must be practice or assessment." };
  if (typeof b.completed !== "boolean") return { ok: false, message: "completed must be true or false." };
  if (!isInt(b.reached, 1, 8)) return { ok: false, message: "reached must be a step from 1 to 8." };
  if (!isInt(b.durationSec, 0, MAX_DURATION_SEC)) return { ok: false, message: "durationSec is out of range." };
  if (!isStr(b.endReason, 120) || b.endReason.length === 0) return { ok: false, message: "endReason is required." };

  if (!Array.isArray(b.mistakes) || b.mistakes.length > MAX_MISTAKES) return { ok: false, message: "mistakes must be a list." };
  const mistakes: Mistake[] = [];
  for (const m of b.mistakes as unknown[]) {
    if (typeof m !== "object" || m === null) return { ok: false, message: "Each mistake must be an object." };
    const r = m as Record<string, unknown>;
    if (!(MISTAKE_CODES as readonly string[]).includes(r.code as string)) return { ok: false, message: "Unknown mistake code." };
    if (!isInt(r.pts, 1, 20) || !isInt(r.step, 1, 8) || !isStr(r.msg, 200)) return { ok: false, message: "Mistake fields are out of range." };
    mistakes.push({ code: r.code as MistakeCode, pts: r.pts, step: r.step, msg: r.msg });
  }

  if (!Array.isArray(b.critical) || b.critical.length > MAX_CRITICAL || !b.critical.every((c) => isStr(c, 240))) {
    return { ok: false, message: "critical must be a list of short messages." };
  }
  const critical = b.critical as string[];

  const score = scoreFrom(mistakes);
  return {
    ok: true,
    value: {
      scenarioId: scenario.id,
      title: scenario.title,
      level: scenario.level,
      mode: b.mode,
      mistakes,
      critical,
      completed: b.completed,
      reached: b.reached,
      durationSec: b.durationSec,
      endReason: b.endReason,
      score,
      passed: isPassed(score, critical.length, b.completed),
    },
  };
}
