import { ADMIN_FEE, FEMALE, MALE } from "./data";
import { BRANDS, deviceLabel, devicesIn } from "./catalogue";
import { digits, fmtPhoneIntl, phoneNum, pick, rint, type Customer } from "./customer";

export type EventId = "collect_now" | "pay_pending" | "gtb_down" | "cash_50" | "spouse" | "ref_no" | "sweep_stuck";

export interface Scenario {
  id: string;
  title: string;
  level: "Starter" | "Core" | "Advanced";
  brief: string;
  setup: (c: Customer) => void;
  events: EventId[];
  /** Index into READY of the item that is false for this customer. */
  notReady?: number;
}

const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "smooth", title: "Smooth application", level: "Starter",
    brief: "A ready customer. Fill every step accurately and handle the questions customers usually ask.",
    setup(c) {
      const d = pick(devicesIn(85000, 150000));
      c.wants = d.id;
      c.downWanted = 30000;
      c.cash = 30000 + ADMIN_FEE + rint(2, 10) * 1000;
      c.says.push(`I want the ${deviceLabel(d)}. I'd like to pay ${naira(30000)} as down payment so the monthly is lower.`);
    },
    events: ["collect_now"],
  },
  {
    id: "nin_phone", title: "NIN or phone number?", level: "Starter",
    brief: "The customer is confused about which number is their NIN.",
    setup(c) {
      c.says.push("My NIN? Just use my phone number, it's the same thing.");
      c.notes.push("The customer handed over a NIN slip.");
    },
    events: [],
  },
  {
    id: "no_sim", title: "BVN line left at home", level: "Starter",
    brief: "Check readiness honestly before you start.",
    setup(c) {
      c.ready[3] = false;
      c.says.push("The SIM for my BVN is in my old phone at home. Just use this new number, it should be fine.");
    },
    events: [], notReady: 3,
  },
  {
    id: "no_deposit", title: "Deposit after payday", level: "Starter",
    brief: "Check readiness honestly before you start.",
    setup(c) {
      c.ready[6] = false;
      c.cash = 0;
      c.says.push("I don't have money for the deposit today. My salary comes on the 28th, can we still start?");
    },
    events: [], notReady: 6,
  },
  {
    id: "ref_format", title: "Messy referee details", level: "Core",
    brief: "The customer reads referee numbers off their contacts list in mixed formats.",
    setup(c) {
      c.refs.forEach((r) => (r.given = fmtPhoneIntl(r.phone)));
      const [firstName, surname] = c.refs[0].name.split(" ");
      c.refs[0].givenName = firstName;
      c.says.push(`Referee 1 is ${firstName}, the surname is ${surname}.`);
      c.selfLine = phoneNum();
      c.says.push(`For the third referee, use my other line ${c.selfLine}. If that's not allowed, use ${c.backupRef.name}.`);
      c.refs[2] = { phone: c.selfLine, name: c.full, rel: "Other", self: true, given: c.selfLine };
    },
    events: [],
  },
  {
    id: "budget", title: "Phone above budget", level: "Core",
    brief: "The customer wants a phone they may not be able to afford today.",
    setup(c) {
      // A brand with both a premium phone and an everyday one the customer can afford.
      const brand = pick(BRANDS.map((b) => b.key).filter((k) => devicesIn(600000, Infinity, k).length && devicesIn(85000, 200000, k).length));
      const big = pick(devicesIn(600000, Infinity, brand));
      const small = pick(devicesIn(85000, 200000, brand));
      c.wants = big.id;
      c.fallback = small.id;
      c.cash = 60000;
      c.says.push(`I want the ${deviceLabel(big)}. I have ${naira(60000)} on me today. If that's too much, the ${deviceLabel(small)} is fine.`);
    },
    events: [],
  },
  {
    id: "pay_stuck", title: "Payment not showing", level: "Core",
    brief: "The customer pays, but the app keeps waiting.",
    setup() {},
    events: ["pay_pending"],
  },
  {
    id: "code_expired", title: "Offer code expired", level: "Starter",
    brief: "The customer was slow to read out the confirmation code.",
    setup(c) {
      c.notes.push("The customer takes a long phone call before reading out the offer code.");
    },
    events: [],
  },
  {
    id: "gtb_down", title: "Bank unavailable for mandate", level: "Core",
    brief: "The customer's main bank can't be linked today.",
    setup(c) {
      c.accounts[0].bank = "GT Bank";
      c.accounts.push({ bank: "PremiumTrust Bank", acct: "01" + digits(8), holder: c.accounts[0].holder, own: true });
      c.says.push("I also have a PremiumTrust account in my name if you need it.");
    },
    events: ["gtb_down", "cash_50"],
  },
  {
    id: "spouse", title: "Account in spouse's name", level: "Advanced",
    brief: "The customer wants to use a shared account.",
    setup(c) {
      const spouseFirst = c.gender === "Male" ? pick(FEMALE) : pick(MALE);
      c.marital = "Married";
      const own = c.accounts[0];
      own.bank = "Kuda Bank";
      own.primary = false;
      c.accounts.unshift({ bank: "Access Bank", acct: "0" + digits(9), holder: `${c.last} ${spouseFirst}`.toUpperCase(), own: false, primary: true, spouse: true });
      c.says.push(`Use my ${c.gender === "Male" ? "wife" : "husband"}'s Access Bank account, we share it. I have a Kuda account too but I rarely use it.`);
    },
    events: ["spouse"],
  },
  {
    id: "ref_no", title: "Referee said NO", level: "Advanced",
    brief: "A referee declines and another doesn't reply. The customer wants the phone today.",
    setup(c) {
      c.says.push(`If one of them doesn't answer, my backup is ${c.backupRef.name}.`);
    },
    events: ["ref_no", "collect_now"],
  },
  {
    id: "bvn_phone", title: "BVN on an old number", level: "Advanced",
    brief: "The phone number on the customer's BVN is not the one they use daily.",
    setup(c) {
      c.bvnPhone = phoneNum();
      c.says.push(`My BVN is registered with my old line ${c.bvnPhone}. It's in this phone as SIM 2.`);
    },
    events: [],
  },
  {
    id: "sweep_stuck", title: "Account sweep stuck", level: "Advanced",
    brief: "Repayment collections won't finish.",
    setup() {},
    events: ["sweep_stuck"],
  },
];

export const SCENARIO_IDS = SCENARIOS.map((s) => s.id);

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export interface SimEvent {
  who: string;
  prompt: string;
  options: { t: string; ok: boolean }[];
  why: string;
}

export const EVENTS: Record<EventId, SimEvent> = {
  collect_now: {
    who: "Customer",
    prompt: "\"Can I take the phone home today? I've paid the deposit.\" Referees haven't confirmed yet.",
    options: [
      { t: "Not yet. The device stays locked until at least 2 referees reply YES. We'll finish the other steps while we wait.", ok: true },
      { t: "Yes. Referees are only a formality once the deposit is paid.", ok: false },
      { t: "Start a fresh application with new referees so it moves faster.", ok: false },
    ],
    why: "The referee status screen says device release stays locked until at least 2 of 3 referees confirm. You can continue the other setup steps meanwhile.",
  },
  pay_pending: {
    who: "Customer",
    prompt: "\"I've paid but your app is still waiting. Should I pay again?\"",
    options: [
      { t: "Pay again with Pay now, just to be safe.", ok: false },
      { t: "Don't pay again. Tap Refresh status. If nothing changes after a few minutes, message Sapphire support on WhatsApp. Progress is saved.", ok: true },
      { t: "Close the page and start a new application.", ok: false },
    ],
    why: "The app's own message says to tap Refresh status and contact support if nothing changes. Paying twice or restarting creates duplicate payments and applications.",
  },
  gtb_down: {
    who: "Mandate page",
    prompt: "GTB shows \"Temporarily unavailable\" on the mandate page.",
    options: [
      { t: "Use your own (MBE) bank account for now and switch it later.", ok: false },
      { t: "Link the customer's other account that is in their own name.", ok: true },
      { t: "Skip the mandate and only do the account sweep.", ok: false },
    ],
    why: "The mandate must use an active account in the customer's own name. Any own account works, so choose another bank. Never link a staff or third-party account.",
  },
  cash_50: {
    who: "Customer",
    prompt: "The customer hands you ₦50 cash and asks you to do the transfer for them.",
    options: [
      { t: "Take the cash and send ₦50 from your own bank app.", ok: false },
      { t: "Decline. The customer sends ₦50 from their own bank app or internet banking, from the account being linked.", ok: true },
      { t: "Pay it by POS or USSD instead.", ok: false },
    ],
    why: "The page says only transfers from the customer's bank app or internet banking are accepted. The ₦50 proves the customer controls that account.",
  },
  spouse: {
    who: "Your details",
    prompt: "The account holder shows the customer's spouse. The customer says it's fine because they share it.",
    options: [
      { t: "Continue. A shared family account is acceptable.", ok: false },
      { t: "Stop and use an account in the customer's own name instead.", ok: true },
      { t: "Continue now, and change the account at pickup.", ok: false },
    ],
    why: "Readiness item 5 requires the customer's own active bank account. Repayment authorisation must come from the borrower.",
  },
  ref_no: {
    who: "Referee status",
    prompt: "Referee 2 replied NO and Referee 3 hasn't replied. The customer says the deposit should be enough.",
    options: [
      { t: "Ask the customer to call Referee 2 and get them to change their answer.", ok: false },
      { t: "Add a replacement referee from the customer and send a new request.", ok: true },
      { t: "Do nothing. The deposit means it will go through anyway.", ok: false },
    ],
    why: "At least 2 of 3 referees must reply YES. If fewer confirm, the down payment is refunded within 24 to 48 hours, so use \"Provide a replacement referee\".",
  },
  sweep_stuck: {
    who: "Collections",
    prompt: "Account sweep is still not active after several refreshes.",
    options: [
      { t: "Continue without it. The mandate is enough.", ok: false },
      { t: "Regenerate the account sweep link and have the customer authorise again. If it still fails, use the backup option on the page or message support.", ok: true },
      { t: "Start a new application.", ok: false },
    ],
    why: "Account sweep is required before the device can be released. Regenerate the link, then use the backup direct-debit option or support.",
  },
};
