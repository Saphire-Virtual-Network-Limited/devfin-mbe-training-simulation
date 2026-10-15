import { describe, expect, it } from "vitest";
import { isPassed, minDown, offerFor, scoreFrom } from "./scoring";
import { parseAttempt } from "./attempt";

describe("offer maths", () => {
  it("matches the offer recorded in the live app (Camon 17)", () => {
    expect(minDown(94900)).toBe(18980);
    const o = offerFor(94900, 18980);
    expect(o.loan).toBe(75920);
    expect(o.totalNow).toBe(29980);
    expect(o.monthly).toBe(21005);
  });
  it("caps the loan for expensive phones (Phantom V Flip shown at ₦583,600 minimum)", () => {
    expect(minDown(783600)).toBe(583600);
  });
});

describe("scoring", () => {
  it("never goes below zero", () => {
    expect(scoreFrom([{ pts: 60 }, { pts: 60 }])).toBe(0);
  });
  it("requires completion, the pass mark and no critical error", () => {
    expect(isPassed(80, 0, true)).toBe(true);
    expect(isPassed(79, 0, true)).toBe(false);
    expect(isPassed(100, 1, true)).toBe(false);
    expect(isPassed(100, 0, false)).toBe(false);
  });
});

const good = {
  scenarioId: "smooth",
  mode: "assessment",
  mistakes: [{ code: "DATA", pts: 3, step: 3, msg: "Email didn't match the customer's documents." }],
  critical: [],
  completed: true,
  reached: 8,
  durationSec: 400,
  endReason: "Completed all 8 steps",
};

describe("parseAttempt", () => {
  it("recomputes score and pass instead of trusting the browser", () => {
    const r = parseAttempt({ ...good, score: 100, passed: true, title: "fake" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.score).toBe(97);
      expect(r.value.passed).toBe(true);
      expect(r.value.title).toBe("Smooth application");
    }
  });
  it("fails a run with a critical error even at a high score", () => {
    const r = parseAttempt({ ...good, critical: ["Used an account not in the customer's name."] });
    expect(r.ok && r.value.passed).toBe(false);
  });
  it.each([
    ["unknown scenario", { scenarioId: "nope" }],
    ["bad mode", { mode: "exam" }],
    ["step out of range", { reached: 9 }],
    ["negative duration", { durationSec: -1 }],
    ["unknown mistake code", { mistakes: [{ code: "HACK", pts: 1, step: 1, msg: "x" }] }],
    ["zero-point mistake", { mistakes: [{ code: "DATA", pts: 0, step: 1, msg: "x" }] }],
    ["non-array critical", { critical: "x" }],
    ["missing end reason", { endReason: "" }],
  ])("rejects %s", (_label, patch) => {
    expect(parseAttempt({ ...good, ...patch }).ok).toBe(false);
  });
  it("rejects non-objects", () => {
    expect(parseAttempt(null).ok).toBe(false);
    expect(parseAttempt("x").ok).toBe(false);
  });
});
