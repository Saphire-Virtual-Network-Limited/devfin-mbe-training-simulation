import { FEMALE, MALE, PHONE_PREFIXES, STORES, STREETS, SURNAMES } from "./data";

/** Every customer is generated. Never put a real person's details here. */

export interface Account {
  bank: string;
  acct: string;
  holder: string;
  own: boolean;
  primary?: boolean;
  spouse?: boolean;
}

export interface Referee {
  name: string;
  phone: string;
  rel: string;
  /** How the customer reads the number out, when it differs from the clean form. */
  given?: string;
  /** Set when the customer only gives a first name. */
  givenName?: string;
  /** The customer's own line, offered as a referee. */
  self?: boolean;
}

export interface Message {
  text: string;
  at: number;
}

export interface Customer {
  first: string;
  middle: string;
  last: string;
  gender: "Male" | "Female";
  full: string;
  phone: string;
  bvnPhone: string;
  selfLine?: string;
  bvn: string;
  nin: string;
  tracking: string;
  dob: { d: number; m: number; y: number };
  state: string;
  area: string;
  store: string;
  address: string;
  email: string;
  marital: string;
  schooling: string;
  employment: string;
  job: string;
  income: number;
  accounts: Account[];
  refs: Referee[];
  backupRef: Referee;
  wants: string;
  fallback: string | null;
  cash: number;
  downWanted: number | null;
  ready: boolean[];
  says: string[];
  notes: string[];
  msgs: Message[];
  unread: number;
}

export const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
export const rint = (a: number, b: number): number => a + Math.floor(Math.random() * (b - a + 1));
export const digits = (n: number): string => Array.from({ length: n }, () => rint(0, 9)).join("");
export const phoneNum = (): string => pick(PHONE_PREFIXES) + digits(7);
export const fmtPhoneIntl = (p: string): string => `+234 ${p.slice(1, 4)} ${p.slice(4, 7)} ${p.slice(7)}`;

function trackingId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  return Array.from({ length: 15 }, () => chars[rint(0, chars.length - 1)]).join("");
}

export function makeCustomer(): Customer {
  const gender = pick(["Male", "Female"] as const);
  const names = gender === "Male" ? MALE : FEMALE;
  const first = pick(names);
  let middle = pick(names);
  if (middle === first) middle = "Oluwaseun";
  const last = pick(SURNAMES);
  const store = pick(STORES);
  const employment = pick(["Employed", "Self-employed"]);
  const job =
    employment === "Employed"
      ? pick(["Sales executive", "Teacher", "Nurse", "Bank teller", "Driver", "Accountant"])
      : pick(["Tailor", "Provisions shop owner", "Hairdresser", "POS agent", "Food vendor", "Phone repairer"]);
  const bank = pick(["Access Bank", "GT Bank", "First Bank", "Zenith Bank", "UBA", "Fidelity Bank", "Wema Bank"]);
  const phone = phoneNum();

  const refs: Referee[] = ["Family", "Friend", "Colleague"].map((rel) => ({
    name: `${pick(pick([MALE, FEMALE]))} ${pick(SURNAMES)}`,
    phone: phoneNum(),
    rel,
  }));

  return {
    first,
    middle,
    last,
    gender,
    full: `${first} ${last}`,
    phone,
    bvnPhone: phone,
    bvn: "22" + digits(9),
    nin: String(rint(1, 9)) + digits(10),
    tracking: trackingId(),
    dob: { d: rint(1, 28), m: rint(1, 12), y: rint(1978, 2003) },
    state: store.state,
    area: store.area,
    store: store.id,
    address: `${rint(2, 48)}, ${pick(STREETS[store.area])}`,
    email: `${first}.${last}${rint(10, 99)}@gmail.com`.toLowerCase(),
    marital: pick(["Single", "Married"]),
    schooling: pick(["Secondary", "Tertiary"]),
    employment,
    job,
    income: pick([80000, 120000, 150000, 180000, 250000, 320000]),
    accounts: [{ bank, acct: "0" + digits(9), holder: `${last} ${first} ${middle}`.toUpperCase(), own: true, primary: true }],
    refs,
    backupRef: { name: `${pick(pick([MALE, FEMALE]))} ${pick(SURNAMES)}`, phone: phoneNum(), rel: "Friend" },
    wants: "camon17",
    fallback: null,
    cash: 45000,
    downWanted: null,
    ready: [true, true, true, true, true, true, true],
    says: [],
    notes: [],
    msgs: [],
    unread: 0,
  };
}
