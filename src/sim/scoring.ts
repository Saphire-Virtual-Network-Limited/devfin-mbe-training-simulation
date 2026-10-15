import { ADMIN_FEE, MAX_LOAN, MIN_DOWN_SHARE, MONTHLY_RATE, TENURE_MONTHS } from "./data";

/**
 * Pure rules shared by the browser (to show a running score) and the server
 * (which recomputes the score and pass/fail itself and never trusts the
 * browser's own verdict).
 */

export const PASS_MARK = 80;
export const START_POINTS = 100;

export const MISTAKE_CODES = [
  "FORMAT", "ID_FAIL", "NIN_PHONE", "READY_FALSE", "WRONG_ITEM", "EARLY_STOP", "DATA", "DEVICE",
  "UNAFFORDABLE", "DOWN", "CODE", "PAY_TWICE", "REF_SELF", "REF_DATA", "REF_NOT_REPLACED",
  "ACCT_NOT_OWN", "MANDATE", "STORE", "JUDGE",
] as const;
export type MistakeCode = (typeof MISTAKE_CODES)[number];

/** Trainer-facing labels for each mistake code. */
export const MISTAKE_LABELS: Record<MistakeCode, string> = {
  FORMAT: "App rejected an entry",
  ID_FAIL: "BVN/NIN didn't match official record",
  NIN_PHONE: "Typed phone number as NIN",
  READY_FALSE: "Ticked a readiness item that wasn't true",
  WRONG_ITEM: "Named the wrong readiness gap",
  EARLY_STOP: "Stopped a ready customer",
  DATA: "Detail didn't match the customer",
  DEVICE: "Picked the wrong device",
  UNAFFORDABLE: "Accepted an offer the customer can't pay",
  DOWN: "Down payment not what the customer asked for",
  CODE: "Wrong confirmation code",
  PAY_TWICE: "Tried to pay twice",
  REF_SELF: "Used the customer's own number as a referee",
  REF_DATA: "Referee detail wrong",
  REF_NOT_REPLACED: "Didn't replace a failed referee",
  ACCT_NOT_OWN: "Used an account not in the customer's name",
  MANDATE: "Mandate step error",
  STORE: "Wrong pickup store",
  JUDGE: "Wrong call in a customer situation",
};

/** Points lost for a critical error, on top of failing the run. */
export const CRITICAL_PENALTY = 20;

export interface Mistake {
  code: MistakeCode;
  pts: number;
  step: number;
  msg: string;
}

export function scoreFrom(mistakes: readonly Pick<Mistake, "pts">[]): number {
  const lost = mistakes.reduce((sum, m) => sum + m.pts, 0);
  return Math.max(0, START_POINTS - lost);
}

/** A run passes only when it was finished properly, scored at least the
 * pass mark and had no critical error. */
export function isPassed(score: number, criticalCount: number, completed: boolean): boolean {
  return completed && score >= PASS_MARK && criticalCount === 0;
}

export function minDown(price: number): number {
  return Math.max(Math.round(price * MIN_DOWN_SHARE), price - MAX_LOAN);
}

export interface Offer {
  price: number;
  down: number;
  loan: number;
  fee: number;
  totalNow: number;
  monthly: number;
  tenure: number;
}

export function offerFor(price: number, down: number): Offer {
  const loan = price - down;
  return {
    price,
    down,
    loan,
    fee: ADMIN_FEE,
    totalNow: down + ADMIN_FEE,
    monthly: Math.round((loan * (1 + MONTHLY_RATE * TENURE_MONTHS)) / TENURE_MONTHS),
    tenure: TENURE_MONTHS,
  };
}
