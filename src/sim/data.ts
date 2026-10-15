/**
 * Facts copied from the live DevFin application screens (readiness text,
 * field hints, bank lists, device prices). Keep these in step with the real
 * app: when the app changes, change them here so MBEs practise on what they
 * will actually see.
 *
 * Values marked ASSUMPTION were worked out from one recorded application and
 * must be confirmed with the product team before they are relied on.
 */

export const READY = [
  "I know my 11-digit BVN.",
  "I know my 11-digit NIN (not only have the NIN slip).",
  "I can provide 3 different referee WhatsApp numbers, with at least 2 referees ready to receive and respond now.",
  "I have access to the SIM or phone number linked to my BVN or NIN so I can receive verification and consent codes.",
  "I have my own active bank account for repayment authorization.",
  "I can make a NGN 50 transfer from that bank account when requested.",
  "I can make the required initial deposit if my application is approved.",
] as const;

export const STEPS = [
  "Readiness",
  "Device",
  "Your details",
  "Offer",
  "Payment",
  "Referees",
  "Collections",
  "Pickup store",
] as const;

export const BANKS = [
  "Access Bank", "Accion MF B", "Eco Bank", "FCMB", "Fidelity Bank", "First Bank", "FSDH Merchant Bank",
  "Globus Bank", "GT Bank", "Jaiz Bank", "Keystone Bank", "Kuda Bank", "Lotus Bank", "Moniepoint MFB", "Opay",
  "PalmPay", "Polaris Bank", "PremiumTrust Bank", "Providus Bank", "Stanbic IBTC", "Sterling Bank", "UBA",
  "Union Bank", "Wema Bank", "Zenith Bank",
] as const;

/** Bank names as the mandate (Paystack) page spells them. */
export const PS_BANK: Record<string, string> = {
  "Access Bank": "Access Bank",
  "GT Bank": "GTB",
  "First Bank": "First Bank of Nigeria",
  "Eco Bank": "Ecobank Nigeria",
  "Kuda Bank": "Kuda Bank",
  "PremiumTrust Bank": "PremiumTrust Bank",
  "Zenith Bank": "Zenith Bank",
  UBA: "United Bank for Africa",
  "Wema Bank": "Wema Bank",
  "Fidelity Bank": "Fidelity Bank",
};

export const PS_LIST = [
  "Access Bank", "Citibank Nigeria", "Ecobank Nigeria", "Fidelity Bank", "First Bank of Nigeria", "GTB",
  "Kuda Bank", "PremiumTrust Bank", "United Bank for Africa", "Wema Bank", "Zenith Bank",
] as const;

export const STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi",
  "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
  "Taraba", "Yobe", "Zamfara",
] as const;

export interface Device {
  id: string;
  name: string;
  price: number;
}

/** TECNO models and prices seen in the app on 14 Oct 2026. */
export const DEVICES: readonly Device[] = [
  { id: "camon17", name: "CAMON 17 (128GB+4GB)", price: 94900 },
  { id: "vflip", name: "PHANTOM V FLIP (8GB+256GB)", price: 783600 },
  { id: "vflip2", name: "PHANTOM V FLIP 2 (8GB+256GB)", price: 1053300 },
  { id: "vfold", name: "PHANTOM V FOLD (12GB+512GB)", price: 1075000 },
  { id: "vfold2", name: "PHANTOM V FOLD 2 (12GB+512GB)", price: 1799400 },
];

export const ADMIN_FEE = 11000;
/** ASSUMPTION: flat 11% per month, matched to one recorded offer (₦75,920 → ₦21,005 × 6). */
export const MONTHLY_RATE = 0.11;
/** ASSUMPTION: only 6 months was offered in the recording. */
export const TENURE_MONTHS = 6;
/** ASSUMPTION: loan amount is capped at ₦200,000, with at least 20% down. */
export const MAX_LOAN = 200000;
export const MIN_DOWN_SHARE = 0.2;

export interface Store {
  id: string;
  name: string;
  loc: string;
  area: string;
  state: string;
}

/** Practice stores only. Real partner store names are deliberately not used. */
export const STORES: readonly Store[] = [
  { id: "ikeja", name: "Ikeja Phone Hub", loc: "12 Medical Road, Computer Village, Ikeja, Lagos", area: "Ikeja", state: "Lagos" },
  { id: "lekki", name: "Lekki Gadget Point", loc: "Admiralty Way, Lekki Phase 1, Lagos", area: "Lekki", state: "Lagos" },
  { id: "wuse", name: "Wuse Mobile Centre", loc: "Aminu Kano Crescent, Wuse 2, Abuja", area: "Wuse", state: "FCT" },
  { id: "aba", name: "Aba Device Mart", loc: "Asa Road, Aba", area: "Aba", state: "Abia" },
  { id: "ph", name: "Garden City Phones", loc: "Aba Road, Port Harcourt", area: "Port Harcourt", state: "Rivers" },
  { id: "kano", name: "Kano Phones Plaza", loc: "Beirut Road, Kano", area: "Kano", state: "Kano" },
  { id: "ibadan", name: "Dugbe Mobile Store", loc: "Dugbe Market Road, Ibadan", area: "Ibadan", state: "Oyo" },
];

export const STREETS: Record<string, readonly string[]> = {
  Ikeja: ["Allen Avenue, Ikeja", "Obafemi Awolowo Way, Ikeja", "Toyin Street, Ikeja"],
  Lekki: ["Fola Osibo Road, Lekki Phase 1", "Admiralty Road, Lekki"],
  Wuse: ["Adetokunbo Ademola Crescent, Wuse 2", "Ladoke Akintola Boulevard, Garki"],
  Aba: ["Faulks Road, Aba", "Ngwa Road, Aba"],
  "Port Harcourt": ["Rumuola Road, Port Harcourt", "Woji Road, Port Harcourt"],
  Kano: ["Zoo Road, Kano", "Murtala Mohammed Way, Kano"],
  Ibadan: ["Ring Road, Ibadan", "Bodija Road, Ibadan"],
};

export const MALE = ["Chinedu", "Emeka", "Ibrahim", "Segun", "Yusuf", "Obinna", "Kunle", "Musa", "Ifeanyi", "Babajide", "Sani", "Chukwuma"];
export const FEMALE = ["Chiamaka", "Aisha", "Ngozi", "Funmilayo", "Halima", "Blessing", "Kemi", "Zainab", "Damilola", "Adaeze", "Hauwa", "Titilayo"];
export const SURNAMES = ["Okafor", "Adeyemi", "Bello", "Eze", "Abubakar", "Ogunleye", "Nwosu", "Danjuma", "Olawale", "Ibekwe", "Usman", "Akinola", "Okonkwo", "Lawal"];
export const PHONE_PREFIXES = ["0703", "0706", "0803", "0806", "0810", "0813", "0814", "0816", "0903", "0906", "0708", "0802", "0808", "0812", "0701", "0902", "0907", "0915", "0916"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const TIPS: Record<number, string> = {
  1: "Read each line to the customer and tick only what is true right now. If any item is false, stop here and tell them what to bring back.",
  2: "Check the minimum down payment plus the ₦11,000 admin fee against the cash the customer has today.",
  3: "Copy from documents, not memory. NIN comes from the slip, not the phone. The account holder name must be the customer's.",
  4: "Use Update offer if the customer wants a different down payment. The code goes to the customer's phone and expires in 10 minutes.",
  5: "The payment opens in a new tab. If the app keeps waiting, refresh status. Don't pay twice.",
  6: "Full names (first and last). WhatsApp numbers start with 0, not +234. Three different people, none of them the customer.",
  7: "Use the phone number linked to the BVN. The ₦50 must come from the customer's own bank app or internet banking.",
  8: "Pick the store the customer will actually visit. Explain the QR code and pickup code.",
};
