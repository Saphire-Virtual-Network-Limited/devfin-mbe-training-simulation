/**
 * The practice simulator, rendered straight into the DOM.
 *
 * Why not React components: the simulator is one long, stateful form flow
 * that was built and field-tested as plain DOM code. Keeping that shape
 * avoids re-introducing bugs in a rewrite. React only mounts it
 * (src/components/Simulator.tsx).
 *
 * Every value written into innerHTML goes through esc(). Customer data is
 * generated, but form input is typed by the MBE, so it is treated as untrusted.
 */
import { ADMIN_FEE, BANKS, DEVICES, MONTHS, PS_BANK, PS_LIST, READY, STATES, STEPS, STORES, TIPS } from "./data";
import { makeCustomer, pick, rint, type Customer } from "./customer";
import { EVENTS, SCENARIOS, type EventId, type Scenario } from "./scenarios";
import { CRITICAL_PENALTY, isPassed, minDown, offerFor, PASS_MARK, scoreFrom, type Mistake, type MistakeCode, type Offer } from "./scoring";
import type { AttemptInput } from "./attempt";

export interface SimUser {
  name: string;
  staffId: string;
  isTrainer: boolean;
  isDemo: boolean;
}

export interface SavedAttempt {
  id: string;
  scenarioId: string;
  title: string;
  mode: "practice" | "assessment";
  score: number;
  passed: boolean;
  critical: string[];
  durationSec: number;
  finishedAt: string;
}

type LogEntry = Mistake;

interface RefStatus {
  name: string;
  phone: string;
  s: "PENDING" | "YES" | "NO" | "NONE";
}

interface MandateFlow {
  stage?: "phone" | "otp" | "bank" | "addr" | "transfer";
  phone?: string;
  otp?: string;
  bank?: string;
  acct?: string;
  holder?: string;
  addr?: string;
  city?: string;
  state?: string;
  sent?: boolean;
  err?: string | null;
}

interface Run {
  scen: Scenario;
  c: Customer;
  step: number;
  sub: null | "confirm" | "status" | "ready";
  started: number;
  log: LogEntry[];
  critical: { code: MistakeCode; msg: string; step: number }[];
  vUsed: Record<string, number>;
  form: Record<string, string | boolean>;
  errs: Record<string, string | null>;
  device: string | null;
  offer: Offer | null;
  code: string | null;
  lied: number[];
  eventsDone: Partial<Record<EventId, { i: number; ok: boolean }>>;
  idState: null | "checking" | "ok" | "fail";
  acctState: null | { state: "checking" } | { state: "ok"; holder: string } | { state: "fail" };
  timers: number[];
  // step-specific flags
  step3done?: boolean;
  downChecked?: boolean;
  overBudgetPen?: boolean;
  expiredShown?: boolean;
  payOpened?: boolean;
  payPending?: boolean;
  payPendingShown?: boolean;
  payRefresh: number;
  refStatus: RefStatus[] | null;
  refBlock?: boolean;
  selfFlag?: boolean;
  acctNotOwnFlag?: boolean;
  mandate: "NOT STARTED" | "WAITING" | "ACTIVE";
  sweep: "NOT STARTED" | "WAITING" | "ACTIVE";
  sweepRefresh: number;
  regen?: boolean;
  regenAfterStuck?: boolean;
  mf: MandateFlow;
  store: string | null;
  storeQ: string;
  pickupCode?: string;
  ended: boolean;
}

interface Result {
  input: AttemptInput;
  score: number;
  passed: boolean;
  title: string;
  log: LogEntry[];
  scen: Scenario;
  eventsDone: Run["eventsDone"];
}

type View = "home" | "run" | "results" | "mine";

export interface SimOptions {
  user: SimUser;
  saveAttempt: (a: AttemptInput) => Promise<{ ok: true } | { ok: false; message: string }>;
  loadAttempts: () => Promise<SavedAttempt[]>;
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const pad = (n: number) => String(n).padStart(2, "0");
const fmtDur = (s: number) => `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
const fmtWhen = (t: string | number) => {
  try {
    return new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};
const deviceById = (id: string) => DEVICES.find((d) => d.id === id) ?? DEVICES[0];
const storeById = (id: string) => STORES.find((s) => s.id === id) ?? STORES[0];

export function mountSimulator(host: HTMLElement, opts: SimOptions): () => void {
  host.innerHTML = `<div class="wrap" id="sim-app"></div><div id="sim-layer"></div><div id="sim-toast" class="toast" role="status" aria-live="polite" hidden></div>`;
  const app = host.querySelector<HTMLElement>("#sim-app") as HTMLElement;
  const layer = host.querySelector<HTMLElement>("#sim-layer") as HTMLElement;
  const toastEl = host.querySelector<HTMLElement>("#sim-toast") as HTMLElement;

  const S: { view: View; mode: "practice" | "assessment"; run: Run | null; last: Result | null; mine: SavedAttempt[] | null; mineErr: string | null } = {
    view: "home",
    mode: "practice",
    run: null,
    last: null,
    mine: null,
    mineErr: null,
  };

  /* ---------- small DOM helpers ---------- */
  function q<T extends HTMLElement = HTMLElement>(sel: string): T | null {
    return host.querySelector<T>(sel);
  }
  function must<T extends HTMLElement = HTMLElement>(sel: string): T {
    const el = host.querySelector<T>(sel);
    if (!el) throw new Error(`Simulator element missing: ${sel}`);
    return el;
  }
  const inputVal = (sel: string) => must<HTMLInputElement>(sel).value.trim();
  let toastTimer: number | undefined;
  function toast(t: string) {
    toastEl.textContent = t;
    toastEl.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toastEl.hidden = true), 2600);
  }
  function later(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms);
    S.run?.timers.push(id);
  }
  const run = (): Run => {
    if (!S.run) throw new Error("No active run");
    return S.run;
  };

  /* ---------- run engine ---------- */
  function startRun(scenId: string | null) {
    S.run?.timers.forEach((t) => window.clearTimeout(t));
    const scen = (scenId && SCENARIOS.find((s) => s.id === scenId)) || pick(SCENARIOS);
    const c = makeCustomer();
    scen.setup(c);
    S.run = {
      scen, c, step: 1, sub: null, started: Date.now(), log: [], critical: [], vUsed: {}, form: {}, errs: {},
      device: null, offer: null, code: null, lied: [], eventsDone: {}, idState: null, acctState: null, timers: [],
      payRefresh: 0, refStatus: null, mandate: "NOT STARTED", sweep: "NOT STARTED", sweepRefresh: 0, mf: {},
      store: null, storeQ: "", ended: false,
    };
    S.view = "run";
    render();
    window.scrollTo(0, 0);
    later(() => toast("Open Customer to see who you're serving"), 400);
  }
  const score = () => scoreFrom(run().log);
  function penal(code: MistakeCode, pts: number, msg: string) {
    const r = run();
    if (pts > 0) r.log.push({ code, pts, msg: msg.slice(0, 200), step: r.step });
    const el = q("#scoreNow");
    if (el) el.textContent = `${score()} pts`;
  }
  function vfail(key: string, fields: string[]) {
    const r = run();
    const used = r.vUsed[key] ?? 0;
    const p = Math.min(2, Math.max(0, 6 - used));
    r.vUsed[key] = used + 2;
    penal("FORMAT", p, `App rejected: ${fields.join(", ")}`);
  }
  function critical(code: MistakeCode, msg: string) {
    const r = run();
    r.critical.push({ code, msg, step: r.step });
    penal(code, CRITICAL_PENALTY, msg);
  }
  const hasEvent = (id: EventId) => run().scen.events.includes(id);
  function sendSms(text: string) {
    const c = run().c;
    c.msgs.unshift({ text, at: Date.now() });
    c.unread++;
    updateBadge();
    toast("Customer's phone: new message");
  }
  function updateBadge() {
    const b = q("#custBadge");
    if (!b || !S.run) return;
    b.textContent = String(S.run.c.unread);
    b.hidden = !S.run.c.unread;
  }

  function fireEvent(id: EventId, after?: () => void) {
    const r = run();
    if (!hasEvent(id) || r.eventsDone[id]) {
      after?.();
      return;
    }
    const ev = EVENTS[id];
    openLayer(
      `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="evh">
        <span class="tag sim">Situation · ${esc(ev.who)}</span>
        <h3 id="evh">${esc(ev.prompt)}</h3><p class="small muted">What do you do?</p>
        <div class="stack8" id="evopts">${ev.options.map((o, i) => `<button class="choice" data-i="${i}">${esc(o.t)}</button>`).join("")}</div>
        <div id="evwhy" hidden></div></div>`,
      true,
      false,
    );
    must("#evopts").onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".choice");
      if (!b || r.eventsDone[id]) return;
      const i = Number(b.dataset.i);
      const ok = ev.options[i].ok;
      r.eventsDone[id] = { i, ok };
      if (!ok) penal("JUDGE", 10, `Situation: ${ev.prompt.replace(/"/g, "").slice(0, 80)}`);
      Array.from(must("#evopts").children).forEach((x, j) => {
        (x as HTMLButtonElement).disabled = true;
        if (ev.options[j].ok) x.classList.add("right");
        else if (j === i) x.classList.add("wrong");
      });
      const w = must("#evwhy");
      w.hidden = false;
      w.innerHTML = `<div class="note ${ok ? "ok" : "bad"}"><div><b>${ok ? "Right call." : "Not the right call."}</b> ${esc(ev.why)}</div></div><button class="btn" id="evgo">Continue</button>`;
      must("#evgo").onclick = () => {
        closeLayer();
        after?.();
      };
      must<HTMLButtonElement>("#evgo").focus();
    };
  }

  function endRun(reason: string, completed = false) {
    const r = run();
    if (r.ended) return;
    r.ended = true;
    r.timers.forEach((t) => window.clearTimeout(t));
    closeLayer();
    const durationSec = Math.min(4 * 3600, Math.round((Date.now() - r.started) / 1000));
    const input: AttemptInput = {
      scenarioId: r.scen.id,
      mode: S.mode,
      mistakes: r.log.slice(0, 80),
      critical: r.critical.map((x) => x.msg).slice(0, 10),
      completed,
      reached: r.step,
      durationSec,
      endReason: reason,
    };
    const sc = scoreFrom(input.mistakes);
    S.last = { input, score: sc, passed: isPassed(sc, input.critical.length, completed), title: r.scen.title, log: r.log, scen: r.scen, eventsDone: r.eventsDone };
    S.mine = null;
    S.view = "results";
    render();
    window.scrollTo(0, 0);
    void save(input);
  }

  async function save(input: AttemptInput) {
    const setState = (html: string) => {
      const st = q("#saveState");
      if (st) st.innerHTML = html;
    };
    try {
      const res = await opts.saveAttempt(input);
      if (res.ok) setState(`<div class="note ok">Saved. Your trainer can see this attempt.</div>`);
      else setState(`<div class="note bad">Couldn't save: ${esc(res.message)}</div>`);
    } catch {
      setState(`<div class="note bad">Couldn't save. Check your connection and try another run.</div>`);
    }
  }

  /* ---------- layers ---------- */
  function openLayer(html: string, center: boolean, dismiss = true) {
    layer.innerHTML = `<div class="scrim ${center ? "center" : ""}" id="scrim">${html}</div>`;
    if (dismiss)
      must("#scrim").addEventListener("click", (e) => {
        if ((e.target as HTMLElement).id === "scrim") closeLayer();
      });
    document.body.style.overflow = "hidden";
    layer.querySelector<HTMLElement>("button,input")?.focus({ preventScroll: true });
  }
  function closeLayer() {
    layer.innerHTML = "";
    document.body.style.overflow = "";
  }

  function customerSheet() {
    const c = run().c;
    const unreadBefore = c.unread;
    c.unread = 0;
    updateBadge();
    const d = c.dob;
    const dev = deviceById(c.wants);
    const row = (k: string, v: string, mono = false) => `<div class="row"><span class="grow small muted">${esc(k)}</span><span class="${mono ? "mono" : ""}">${esc(v)}</span></div>`;
    const accts = c.accounts.map((a) => `<div class="row"><span class="grow">${esc(a.bank)}${a.primary ? " <span class='pill idle'>gave first</span>" : ""}</span><span class="mono">${esc(a.acct)}</span></div>`).join("");
    const refs = c.refs
      .map((x, i) => `<div class="row"><span class="grow">Referee ${i + 1}: ${esc(x.givenName || x.name)}${x.givenName ? " <span class='small muted'>(first name only)</span>" : ""} · ${esc(x.rel)}</span><span class="mono">${esc(x.given || x.phone)}</span></div>`)
      .join("");
    openLayer(
      `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="csh">
        <div class="row"><span class="tag sim grow">Customer file · not part of the app</span><button class="chipbtn" id="cclose">Close</button></div>
        <h2 id="csh">${esc(c.first)} ${esc(c.middle)} ${esc(c.last)}</h2>
        ${c.says.length ? `<div class="simbox"><span class="tag sim">The customer says</span>${c.says.map((s) => `<p class="quote">${esc(s)}</p>`).join("")}</div>` : ""}
        ${c.notes.map((n) => `<p class="small muted">${esc(n)}</p>`).join("")}
        <div class="doc"><span class="h">Messages on customer's phone</span>${
          c.msgs.length ? c.msgs.map((m, i) => `<div class="msg ${i < unreadBefore ? "new" : ""}">${esc(m.text)}</div>`).join("") : `<p class="small muted">No messages yet. Codes from the app arrive here.</p>`
        }</div>
        <div class="doc"><span class="h">NIN slip</span>${row("Tracking ID", c.tracking, true)}${row("NIN", c.nin, true)}${row("Surname / First / Middle", `${c.last} ${c.first} ${c.middle}`.toUpperCase())}${row("Date of birth", `${d.d} ${MONTHS[d.m - 1]} ${d.y}`)}${row("Gender", c.gender)}</div>
        <div class="doc"><span class="h">Bank app (BVN shown in profile)</span>${row("BVN", c.bvn, true)}${accts}</div>
        <div class="doc"><span class="h">Contact and background</span>${row("Phone in use", c.phone, true)}${row("Email", c.email)}${row("Lives at", `${c.address}, ${c.state}`)}${row("Marital status", c.marital)}${row("Schooling", c.schooling)}${row("Work", `${c.employment} · ${c.job}`)}${row("Monthly income", naira(c.income))}</div>
        <div class="doc"><span class="h">Referees from the customer's contacts</span>${refs}</div>
        <div class="doc"><span class="h">What they want</span>${row("Phone", `TECNO ${dev.name}`)}${row("Cash available today", naira(c.cash))}${row("Collect near", c.area)}</div>
      </div>`,
      false,
    );
    must("#cclose").onclick = closeLayer;
  }

  /* ---------- views ---------- */
  function render() {
    if (S.view === "run" && S.run && !S.run.ended) {
      app.innerHTML = runView();
      bindRun();
      return;
    }
    app.onclick = null;
    app.oninput = null;
    app.onchange = null;
    const nav = `<nav class="nav" aria-label="Sections">
      <button data-nav="home" aria-current="${S.view === "home"}">Practice</button>
      <button data-nav="mine" aria-current="${S.view === "mine"}">My results</button>
      ${opts.user.isTrainer ? `<a href="/trainer">Trainer</a>` : ""}</nav>`;
    let body: string;
    if (S.view === "results") body = resultsView();
    else if (S.view === "mine") body = mineView();
    else body = homeView();
    app.innerHTML = (S.view === "results" ? "" : nav) + body;
    app.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach(
      (b) =>
        (b.onclick = () => {
          S.view = b.dataset.nav as View;
          render();
          window.scrollTo(0, 0);
        }),
    );
    bindStatic();
    if (S.view === "mine" && S.mine === null && !S.mineErr) void loadMine();
  }

  async function loadMine() {
    try {
      S.mine = await opts.loadAttempts();
      S.mineErr = null;
    } catch {
      S.mineErr = "Your results couldn't be loaded. Check your connection and try again.";
    }
    if (S.view === "mine") render();
  }

  function homeView() {
    const u = opts.user;
    return `<header class="stack6 pt6">
      <span class="tag sim">${esc(u.name)}${u.staffId ? " · " + esc(u.staffId) : ""}${u.isDemo ? " · demo account" : ""}</span>
      <h1>DevFin Practice Lab</h1>
      <p class="muted">Serve a made-up customer through all 8 steps. Read the customer file, fill the app the way you would in the field, and handle what comes up.</p></header>
      ${u.isDemo ? `<div class="note wait">You're on the demo account. Attempts are saved as demo and left out of trainer reports.</div>` : ""}
      <div class="card"><h3>Mode</h3>
        <div class="radiorow">
          <label class="modeopt"><input type="radio" name="mode" value="practice" ${S.mode === "practice" ? "checked" : ""}><span>Practice<span class="small muted">Coach tips on</span></span></label>
          <label class="modeopt"><input type="radio" name="mode" value="assessment" ${S.mode === "assessment" ? "checked" : ""}><span>Assessment<span class="small muted">No tips. Counts for pass</span></span></label>
        </div>
        <button class="btn" data-act="random">Start a random customer</button>
        <p class="small muted">Pass mark: ${PASS_MARK} points with no critical errors.</p></div>
      <h3 class="pt6">Or pick a situation</h3>
      <div class="stack8">${SCENARIOS.map(
        (s) => `<button class="scen" data-scen="${s.id}"><span class="lvl">${esc(s.level)}</span><b>${esc(s.title)}</b><span class="small muted">${esc(s.brief)}</span></button>`,
      ).join("")}</div>`;
  }

  function bindStatic() {
    host.querySelectorAll<HTMLInputElement>("input[name=mode]").forEach((x) => (x.onchange = () => (S.mode = x.value as "practice" | "assessment")));
    app.querySelectorAll<HTMLButtonElement>("[data-scen]").forEach((b) => (b.onclick = () => startRun(b.dataset.scen ?? null)));
    const rnd = q<HTMLButtonElement>("[data-act=random]");
    if (rnd) rnd.onclick = () => startRun(null);
    app.querySelectorAll<HTMLButtonElement>("[data-again]").forEach((b) => (b.onclick = () => startRun(b.dataset.again || null)));
    const hb = q<HTMLButtonElement>("[data-act=home]");
    if (hb)
      hb.onclick = () => {
        S.view = "home";
        render();
        window.scrollTo(0, 0);
      };
  }

  function runView() {
    const r = run();
    const stepLabel =
      r.step === 4 && r.sub === "confirm" ? "Confirm offer" : r.step === 6 && r.sub === "status" ? "Referee status" : r.step === 8 && r.sub === "ready" ? "Fulfillment" : STEPS[r.step - 1];
    return `<div class="runbar"><div class="t"><span class="tag sim">${S.mode === "assessment" ? "Assessment" : "Practice"}</span><b>${esc(r.scen.title)}</b></div>
      <span class="score" id="scoreNow">${score()} pts</span>
      <button class="chipbtn" data-act="cust">Customer<span class="badge" id="custBadge" ${r.c.unread ? "" : "hidden"}>${r.c.unread}</span></button>
      <button class="chipbtn" data-act="quit" aria-label="Quit this run">✕</button></div>
      ${S.mode === "practice" ? `<div class="simbox"><span class="tag sim">Coach tip</span><p class="small">${esc(TIPS[r.step])}</p></div>` : ""}
      <section class="app" aria-label="DevFin application (practice copy)">
        <div class="brandmark"><i aria-hidden="true"></i>Sapphire</div>
        <div class="stepline"><span>Step ${r.step} of 8</span><span>${esc(stepLabel)}</span></div>
        <div class="bar"><span style="width:${(r.step / 8) * 100}%"></span></div>
        ${stepBody()}
      </section>`;
  }

  function fld(id: string, label: string, o: { type?: string; hint?: string; ph?: string; opts?: readonly string[]; inputmode?: string; maxlength?: number } = {}) {
    const r = run();
    const v = String(r.form[id] ?? "");
    const err = r.errs[id];
    const ctl = o.opts
      ? `<select id="f_${id}" data-f="${id}"><option value="">Select</option>${o.opts.map((x) => `<option ${x === v ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`
      : `<input id="f_${id}" data-f="${id}" type="${o.type ?? "text"}" value="${esc(v)}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ""} ${o.inputmode ? `inputmode="${o.inputmode}"` : ""} ${o.maxlength ? `maxlength="${o.maxlength}"` : ""} autocomplete="off">`;
    return `<div class="field ${err ? "err" : ""}"><label for="f_${id}">${esc(label)}</label>${ctl}${err ? `<span class="errmsg">${esc(err)}</span>` : ""}${o.hint ? `<span class="hint">${esc(o.hint)}</span>` : ""}</div>`;
  }
  const errNote = (k: string) => (run().errs[k] ? `<div class="note bad">${esc(run().errs[k])}</div>` : "");

  function stepBody(): string {
    const r = run();
    switch (r.step) {
      case 1: {
        const all = READY.every((_, i) => r.form["rd" + i]);
        return `<h2>Before you start</h2><p class="muted small">A quick check so your application doesn't stall halfway. Nothing here is saved, so just tick what's true right now.</p>
          <label class="check all"><input type="checkbox" data-act="selall" ${all ? "checked" : ""}> Select all items</label>
          ${READY.map((t, i) => `<label class="check"><input type="checkbox" data-f="rd${i}" ${r.form["rd" + i] ? "checked" : ""}><span>${esc(t)}</span></label>`).join("")}
          ${errNote("s1")}
          <button class="btn" data-act="s1go">I'm ready to continue</button>
          <button class="btn sim" data-act="s1stop">Customer isn't ready: stop here</button>`;
      }
      case 2: {
        const qy = String(r.form.dq ?? "").toLowerCase();
        const list = DEVICES.filter((d) => d.name.toLowerCase().includes(qy));
        return `<h2>TECNO</h2><p class="muted small">Pick the model you'd like to finance. Pricing and minimum down payment update as you select.</p>
          <div class="field"><input id="f_dq" data-f="dq" value="${esc(r.form.dq ?? "")}" placeholder="Search ${DEVICES.length} TECNO models…" aria-label="Search models"></div>
          <div class="stack10">${
            list
              .map(
                (d) => `<button class="opt" data-dev="${d.id}" aria-pressed="${r.form.dev === d.id}"><span><b>${esc(d.name)}</b><br><span class="num">NGN ${d.price.toLocaleString("en-NG")}</span><br><span class="small muted num">Min. down payment ${naira(minDown(d.price))} + ${naira(ADMIN_FEE)} admin fee</span></span><span class="dot"></span></button>`,
              )
              .join("") || `<p class="muted small">No models match.</p>`
          }</div>
          ${errNote("s2")}
          <button class="btn" data-act="s2go">Continue</button>`;
      }
      case 3:
        return step3();
      case 4:
        return r.sub === "confirm" ? step4confirm() : step4();
      case 5:
        return step5();
      case 6:
        return r.sub === "status" ? step6status() : step6();
      case 7:
        return step7();
      default:
        return r.sub === "ready" ? step8ready() : step8();
    }
  }

  const idNoteHtml = (st: Run["idState"]) =>
    st === "checking"
      ? `<div class="note wait" id="idnote"><span class="spin"></span> Identity verification is ongoing. You can continue with Contact while we check.</div>`
      : st === "ok"
        ? `<div class="note ok" id="idnote">✓ Your identity check was completed successfully.</div>`
        : st === "fail"
          ? `<div class="note bad" id="idnote">We couldn't match this BVN and NIN to an official record. Check the numbers on the customer's documents.</div>`
          : `<div id="idnote"></div>`;

  function step3() {
    const r = run();
    const f = r.form;
    const a = r.acctState;
    const acct =
      a?.state === "checking"
        ? `<span class="hint" id="acctnote"><span class="spin"></span> Confirming account name…</span>`
        : a?.state === "ok"
          ? `<span class="hint good" id="acctnote">Account holder: ${esc(a.holder)}</span>`
          : a?.state === "fail"
            ? `<span class="hint bad" id="acctnote">We couldn't find this account at ${esc(f.bank || "this bank")}.</span>`
            : `<span class="hint" id="acctnote"></span>`;
    return `<h2>Tell us about yourself</h2><p class="muted small">This is checked against official records the moment you submit. It's what creates your application.</p>
      <div class="note info">🔒 <div><b>Encrypted at rest.</b> Your BVN, NIN, and bank account number are checked against official records and encrypted. This data is used only for verification and your loan file.</div></div>
      <div class="section">Identity</div>
      ${fld("name", "Full name")}
      ${fld("phone", "Phone number", { hint: "We'll send verification codes and updates here", inputmode: "numeric", maxlength: 11 })}
      ${fld("bvn", "BVN", { hint: "11 digits. We check this against your official record, not just the format.", inputmode: "numeric", maxlength: 11 })}
      ${fld("nin", "NIN", { hint: "11 digits, from your NIN slip or card, not a phone number", inputmode: "numeric", maxlength: 11 })}
      ${idNoteHtml(r.idState)}
      <div class="section">Contact</div>
      ${fld("dob", "Date of birth", { type: "date" })}
      ${fld("state", "Which state do you live in?", { opts: STATES, hint: "Some states have restrictions that can affect your application, so we check this early" })}
      ${fld("email", "Email address", { type: "email" })}
      ${fld("address", "Home address", { hint: "At least 10 characters" })}
      <div class="section">About you</div>
      ${fld("gender", "Gender", { opts: ["Male", "Female", "Prefer not to say"] })}
      ${fld("marital", "Marital status", { opts: ["Single", "Married", "Divorced", "Widowed", "Prefer not to say"] })}
      ${fld("schooling", "Highest level of schooling", { opts: ["Primary", "Secondary", "Tertiary", "Other"] })}
      ${fld("employment", "Employment status", { opts: ["Employed", "Self-employed", "Unemployed", "Student", "Retired", "Other"] })}
      ${fld("job", "Job title or business type", { hint: "Required if employed or self-employed" })}
      ${fld("income", "Monthly income (₦)", { inputmode: "numeric", hint: "Used only for your offer terms, never shared beyond verification" })}
      <div class="section">Bank details</div>
      ${fld("bank", "Bank", { opts: BANKS })}
      <div class="field ${r.errs.acct ? "err" : ""}"><label for="f_acct">Bank account number</label><input id="f_acct" data-f="acct" inputmode="numeric" maxlength="10" value="${esc(f.acct ?? "")}" autocomplete="off">${r.errs.acct ? `<span class="errmsg">${esc(r.errs.acct)}</span>` : ""}<span class="hint">10 digits</span>${acct}</div>
      <div class="card tight"><b>Network check</b><p class="small muted">Skip this optional check and continue with the neutral network score.</p>
        <div class="radiorow"><label><input type="radio" name="net" data-f="net" value="send" ${f.net === "send" ? "checked" : ""}> Send verification code</label><label><input type="radio" name="net" data-f="net" value="skip" ${f.net !== "send" ? "checked" : ""}> Skip</label></div></div>
      <label class="check"><input type="checkbox" data-f="tc" ${f.tc ? "checked" : ""}><span>I accept the Terms &amp; Conditions.</span></label>
      <label class="check"><input type="checkbox" data-f="pp" ${f.pp ? "checked" : ""}><span>I accept the Privacy Policy.</span></label>
      ${errNote("s3")}
      <button class="btn" data-act="s3go">Continue</button>`;
  }

  function step4() {
    const r = run();
    const o = r.offer as Offer;
    const d = deviceById(r.device as string);
    return `<h2>Your loan offer</h2><p class="muted small">Review your approved terms, then confirm to continue.</p>
      <div class="card"><dl class="kv"><dt>Device</dt><dd>${esc(d.name)}</dd><dt>Loan amount</dt><dd>${naira(o.loan)}</dd><dt>Down payment</dt><dd>${naira(o.down)}</dd><dt>Admin fee</dt><dd>${naira(o.fee)}</dd>
      <dt>Total to pay now</dt><dd class="big">${naira(o.totalNow)}</dd><dt>Monthly repayment</dt><dd class="big">${naira(o.monthly)}</dd><dt>Tenure</dt><dd>${o.tenure} months</dd></dl></div>
      <div class="card"><b>Want different terms?</b><p class="small muted">These are your current terms. Change either one, then tap Update offer.</p>
        ${fld("down", "Down payment (₦)", { inputmode: "numeric" })}
        ${fld("tenure", "Tenure", { opts: ["6 months"] })}
        <button class="btn ghost" data-act="s4update">Update offer</button></div>
      <button class="btn" data-act="s4accept">Accept offer</button>
      <button class="btn ghost" data-act="s4device">Choose a different device</button>
      <button class="btn link" data-act="s4decline">Decline this offer</button>`;
  }
  function step4confirm() {
    return `<h2>Confirm your offer</h2><p class="muted small">Enter the code sent to your phone to lock in these terms. It expires in 10 minutes.</p>
      ${fld("code", "6-digit code", { inputmode: "numeric", maxlength: 6 })}
      ${errNote("s4c")}
      <button class="btn" data-act="s4confirm">Confirm &amp; pay down payment</button>
      <button class="btn ghost" data-act="s4resend">Resend code</button>`;
  }

  function step5() {
    const r = run();
    const o = r.offer as Offer;
    return `<h2>Down payment</h2><p class="muted small">Complete your down payment within 30 minutes to lock in this offer.</p>
      <div class="card"><dl class="kv"><dt>Amount due</dt><dd class="big">${naira(o.totalNow)}</dd><dt>Payment method</dt><dd>Card, bank transfer, or USSD</dd></dl></div>
      ${r.payPending ? `<p class="small center">This is taking longer than it should. Tap Refresh status to check again. If nothing changes after a few minutes, message Sapphire support on WhatsApp. Your progress is saved.</p>` : ""}
      <button class="btn" data-act="s5pay">Pay now</button>
      <div class="note info">🛡 <div><b>Secure checkout.</b> This opens in a new tab. We never see or store card details. Once done, come back to this tab and we'll pick up the payment automatically.</div></div>
      ${r.payOpened ? `<button class="btn link" data-act="s5newlink">Link not working? Get a new one</button><button class="btn ghost" data-act="s5refresh">Refresh status</button>` : ""}`;
  }

  function step6() {
    const block = (i: number) =>
      `<div class="card"><b>Referee ${i + 1}</b>${fld("rn" + i, "Name")}${fld("rp" + i, "WhatsApp number", { ph: "08012345678", hint: "Starts with 0, e.g. 08012345678 — not +234", inputmode: "numeric" })}${fld("rr" + i, "Relationship", { opts: ["Family", "Friend", "Colleague", "Other"] })}</div>`;
    return `<h2>Add your referees</h2><p class="muted small">Give us 3 people who know you. We'll message each of them on WhatsApp to confirm.</p>
      <div class="note info">ⓘ <div><b>Why we ask.</b> Each referee receives a WhatsApp message asking them to reply YES or NO. At least 2 of the 3 need to reply YES for your application to proceed. If fewer than 2 confirm, your down payment is refunded automatically within 24 to 48 hours.</div></div>
      ${[0, 1, 2].map(block).join("")}
      ${errNote("s6")}
      <button class="btn" data-act="s6go">Send verification requests</button>`;
  }
  const refPill = (s: RefStatus["s"]) =>
    s === "YES" ? `<span class="pill ok">✓ Confirmed</span>` : s === "NO" ? `<span class="pill no">Declined</span>` : s === "NONE" ? `<span class="pill no">No reply</span>` : `<span class="pill wait">◷ Pending</span>`;
  function step6status() {
    const rs = run().refStatus as RefStatus[];
    const yes = rs.filter((x) => x.s === "YES").length;
    return `<h2>Referee verification</h2><p class="muted small">We'll move you forward automatically once your referees confirm on WhatsApp. You're welcome to check back anytime.</p>
      <div class="note ${yes >= 2 ? "ok" : "info"}">ⓘ <div><b>${Math.min(yes, 2)} of 2 needed have confirmed</b><br>${
        yes >= 2 ? "Device release is unlocked once collections are active." : "We are waiting for at least 2 of your 3 referees to confirm. You can continue any available setup steps, but device release stays locked until then."
      }</div></div>
      <button class="btn" data-act="s6cont">Continue application</button>
      ${rs
        .map(
          (x, i) => `<div class="card"><div class="row"><b class="grow">Referee ${i + 1}: ${esc(x.name)}</b>${refPill(x.s)}</div>
        ${
          x.s === "YES"
            ? ""
            : `<button class="btn link" data-act="s6resend" data-i="${i}">Resend request</button>
          <span class="small muted">Provide a replacement referee</span>${fld("xn" + i, "Name")}${fld("xp" + i, "WhatsApp number", { ph: "08012345678", inputmode: "numeric" })}${fld("xr" + i, "Relationship", { opts: ["Family", "Friend", "Colleague", "Other"] })}
          <button class="btn ghost" data-act="s6replace" data-i="${i}">Send new request</button>`
        }</div>`,
        )
        .join("")}`;
  }

  function step7() {
    const r = run();
    const st = (s: Run["mandate"]) =>
      s === "ACTIVE" ? `<span class="pill ok">✓ Active</span>` : s === "WAITING" ? `<span class="pill wait">Waiting</span>` : `<span class="pill idle">◷ Not started</span>`;
    const sweepHelp =
      r.sweepRefresh >= 2 && r.sweep !== "ACTIVE"
        ? `<div class="note wait"><div><b>Having trouble with account sweep?</b> It's taking longer than expected to get a working sweep. You can set up direct debit on 2-3 of your own bank accounts instead.<br><button class="btn ghost mt8" data-act="s7backup">Set up backup direct debit</button></div></div>`
        : "";
    return `<h2>Set up repayment collections</h2><p class="muted small">Authorize how your monthly repayment gets collected. Account sweep must succeed before your device can be released.</p>
      <p class="small muted center">${r.mandate === "WAITING" ? "Waiting for your bank to confirm the authorization…" : "Checking again in 5s…"}</p>
      <div class="card"><div class="row"><b class="grow">Mandate</b>${st(r.mandate)}</div><p class="small muted">Authorize automatic monthly repayment from your bank account.</p>
        ${r.mandate === "ACTIVE" ? `<div class="note ok">✓ Active</div>` : `<button class="btn" data-act="s7mandate">Authorize bank account mandate ↗</button>`}
        <button class="btn ghost" data-act="s7mrefresh">Refresh status</button></div>
      <div class="card"><div class="row"><b class="grow">Account sweep <span class="small muted">(required)</span></b>${st(r.sweep)}</div><p class="small muted">A required safety net that recovers your payment directly. This must be active before your device can be released.</p>
        ${r.sweep === "ACTIVE" ? `<div class="note ok">✓ Active</div>` : `<button class="btn" data-act="s7sweep">Authorize account sweep ↗</button><button class="btn link" data-act="s7regen">↻ Regenerate account sweep link</button>`}
        <button class="btn ghost" data-act="s7srefresh">Refresh status</button>${sweepHelp}</div>
      ${errNote("s7")}
      <button class="btn" data-act="s7go" ${r.mandate === "ACTIVE" && r.sweep === "ACTIVE" ? "" : "disabled"}>Continue</button>`;
  }

  function step8() {
    const r = run();
    const qy = r.storeQ.toLowerCase();
    const list = STORES.filter((s) => `${s.name} ${s.loc}`.toLowerCase().includes(qy));
    return `<h2>Choose your pickup store</h2><p class="muted small">Pick the store where you'll collect your device. We'll generate your pickup QR code next.</p>
      <div class="note info">ⓘ <div><b>What happens at pickup.</b> Show your QR code (or read out your pickup code) to the store agent. They'll confirm your device and activate it before handing it over. Nothing further is needed from you here.</div></div>
      <div class="field"><label for="f_sq">Pickup store</label><input id="f_sq" data-f="storeQ" value="${esc(r.storeQ)}" placeholder="Search for your pickup store" autocomplete="off"><span class="hint">Search by city, area, or store name, e.g. Lagos, Ikeja</span></div>
      ${r.store ? "" : `<div class="list">${list.map((s) => `<button data-store="${s.id}">${esc(s.name)} — ${esc(s.loc)}</button>`).join("") || `<span class="small muted pad10">No stores match.</span>`}</div>`}
      ${errNote("s8")}
      <button class="btn" data-act="s8go">Continue</button>`;
  }
  function step8ready() {
    const r = run();
    const d = deviceById(r.device as string);
    const st = storeById(r.store as string);
    const o = r.offer as Offer;
    return `<h2>Ready for pickup</h2><p class="muted small">Show this QR code to an MBE agent at your nearest store. Scanning it opens their Sapphire pickup chat.</p>
      <div class="card centered"><canvas id="qr" width="200" height="200" aria-label="Practice QR code (not scannable)"></canvas>
        <span class="small muted">PICKUP CODE (IF QR WON'T SCAN)</span><span class="mono breakall">${esc(r.pickupCode)}</span>
        <span class="tag sim">Practice code, not scannable</span></div>
      <div class="card"><dl class="kv"><dt>Device</dt><dd>TECNO ${esc(d.name)}</dd><dt>Device price</dt><dd>${naira(d.price)}</dd><dt>Loan amount</dt><dd>${naira(o.loan)}</dd><dt>Tenure</dt><dd>${o.tenure} months</dd><dt>Monthly repayment</dt><dd class="big">${naira(o.monthly)}</dd></dl></div>
      <div class="card"><dl class="kv"><dt>Store</dt><dd>${esc(st.name)}</dd><dt>Location</dt><dd>${esc(st.loc)}</dd></dl></div>
      <button class="btn sim" data-act="finish">Finish and see my score</button>`;
  }

  function drawQR() {
    const cv = q<HTMLCanvasElement>("#qr");
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const n = 25;
    const s = 8;
    const ink = getComputedStyle(cv).color;
    const paper = getComputedStyle(cv.parentElement as HTMLElement).backgroundColor;
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = ink;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (Math.random() < 0.48) ctx.fillRect(i * s, j * s, s, s);
    for (const [a, b] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      ctx.fillStyle = ink;
      ctx.fillRect(a * s, b * s, 7 * s, 7 * s);
      ctx.fillStyle = paper;
      ctx.fillRect(a * s + s, b * s + s, 5 * s, 5 * s);
      ctx.fillStyle = ink;
      ctx.fillRect(a * s + 2 * s, b * s + 2 * s, 3 * s, 3 * s);
    }
  }

  /* ---------- run bindings ---------- */
  function bindRun() {
    const r = run();
    const onInput = (e: Event) => {
      const el = e.target as HTMLInputElement;
      const key = el.dataset.f;
      if (!key) return;
      r.form[key] = el.type === "checkbox" ? el.checked : el.value;
      if (r.step === 2 && key === "dq") rerenderKeep("f_dq");
      if (r.step === 8 && key === "storeQ") {
        r.storeQ = el.value;
        r.store = null;
        rerenderKeep("f_sq");
      }
      if (r.step === 3 && (key === "bvn" || key === "nin")) idCheck();
      if (r.step === 3 && (key === "acct" || key === "bank")) acctCheck();
    };
    app.oninput = onInput;
    app.onchange = onInput;
    app.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act],[data-dev],[data-store]");
      if (!b) return;
      if (b.dataset.dev) {
        r.form.dev = b.dataset.dev;
        rerenderKeep();
        return;
      }
      if (b.dataset.store) {
        r.store = b.dataset.store;
        const s = storeById(r.store);
        r.storeQ = `${s.name} — ${s.loc}`;
        rerenderKeep();
        return;
      }
      const act = ACT[b.dataset.act ?? ""];
      if (act) act(b);
    };
    if (r.step === 8 && r.sub === "ready") drawQR();
  }
  function rerenderKeep(focusId?: string) {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    if (!focusId) return;
    const el = document.getElementById(focusId) as HTMLInputElement | null;
    if (!el) return;
    el.focus({ preventScroll: true });
    try {
      el.setSelectionRange(el.value.length, el.value.length);
    } catch {
      /* not a text input */
    }
  }
  function goStep(n: number, sub: Run["sub"] = null) {
    const r = run();
    r.step = n;
    r.sub = sub;
    r.errs = {};
    render();
    window.scrollTo(0, 0);
  }

  function idCheck() {
    const r = run();
    const f = r.form;
    const el = q("#idnote");
    const set = (st: Run["idState"]) => {
      r.idState = st;
      if (el) el.outerHTML = idNoteHtml(st);
    };
    if (onlyDigits(f.bvn).length !== 11 || onlyDigits(f.nin).length !== 11) {
      set(null);
      return;
    }
    set("checking");
    later(() => {
      if (run() !== r) return;
      r.idState = f.bvn === r.c.bvn && f.nin === r.c.nin ? "ok" : "fail";
      const cur = q("#idnote");
      if (cur) cur.outerHTML = idNoteHtml(r.idState);
    }, 1300);
  }
  function acctCheck() {
    const r = run();
    const f = r.form;
    const paint = () => {
      const el = q("#acctnote");
      if (!el) return;
      const a = r.acctState;
      el.className = "hint" + (a?.state === "ok" ? " good" : a?.state === "fail" ? " bad" : "");
      el.innerHTML =
        a?.state === "checking" ? `<span class="spin"></span> Confirming account name…` : a?.state === "ok" ? `Account holder: ${esc(a.holder)}` : a?.state === "fail" ? `We couldn't find this account at ${esc(f.bank)}.` : "";
    };
    if (!f.bank || onlyDigits(f.acct).length !== 10) {
      r.acctState = null;
      paint();
      return;
    }
    r.acctState = { state: "checking" };
    paint();
    later(() => {
      const a = r.c.accounts.find((x) => x.bank === f.bank && x.acct === f.acct);
      r.acctState = a ? { state: "ok", holder: a.holder } : { state: "fail" };
      paint();
      if (a?.spouse) fireEvent("spouse");
    }, 1100);
  }

  function confirmDialog(title: string, body: string, yes: string, onYes: () => void) {
    openLayer(
      `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cdh"><h3 id="cdh">${esc(title)}</h3><p class="muted small">${esc(body)}</p><div class="row"><button class="btn ghost grow" id="cdno">Go back</button><button class="btn grow" id="cdyes">${esc(yes)}</button></div></div>`,
      true,
    );
    must("#cdno").onclick = closeLayer;
    must("#cdyes").onclick = () => {
      closeLayer();
      onYes();
    };
  }

  const ACT: Record<string, (b: HTMLElement) => void> = {
    cust: () => customerSheet(),
    quit: () => confirmDialog("Quit this customer?", "The attempt is saved as not finished.", "Quit", () => endRun("Quit before finishing")),
    selall: (b) => {
      const v = (b as HTMLInputElement).checked;
      READY.forEach((_, i) => (run().form["rd" + i] = v));
      rerenderKeep();
    },
    s1go: () => {
      const r = run();
      if (!READY.every((_, i) => r.form["rd" + i])) {
        r.errs.s1 = "Every item must be true before you continue. If one isn't, stop here.";
        vfail("s1", ["readiness checklist"]);
        rerenderKeep();
        return;
      }
      r.lied = r.c.ready.flatMap((v, i) => (v ? [] : [i]));
      goStep(2);
    },
    s1stop: () => {
      const r = run();
      openLayer(
        `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="sth"><span class="tag sim">Stop the application</span><h3 id="sth">Which item isn't true for this customer?</h3>
        <div class="stack8" id="stopopts">${READY.map((t, i) => `<button class="choice" data-i="${i}">${esc(t)}</button>`).join("")}<button class="choice" data-i="-1">Actually, everything is true</button></div></div>`,
        true,
      );
      must("#stopopts").onclick = (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".choice");
        if (!b) return;
        const i = Number(b.dataset.i);
        closeLayer();
        if (i === -1) return;
        if (r.scen.notReady === undefined) {
          critical("EARLY_STOP", "Stopped a customer who was ready to apply.");
          endRun("Stopped a ready customer");
          return;
        }
        if (i !== r.scen.notReady) penal("WRONG_ITEM", 10, `Named "${READY[i].slice(0, 50)}…" but the real gap was "${READY[r.scen.notReady].slice(0, 50)}…"`);
        endRun("Correctly stopped: customer not ready", true);
      };
    },
    s2go: () => {
      const r = run();
      if (!r.form.dev) {
        r.errs.s2 = "Select a model to continue.";
        vfail("s2", ["device"]);
        rerenderKeep();
        return;
      }
      r.device = String(r.form.dev);
      const okIds = [r.c.wants, r.c.fallback].filter(Boolean);
      if (!okIds.includes(r.device)) penal("DEVICE", 5, `Picked ${deviceById(r.device).name}; the customer asked for ${deviceById(r.c.wants).name}.`);
      if (!r.step3done) goStep(3);
      else {
        makeOffer();
        goStep(4);
      }
    },
    s3go: () => s3submit(),
    s4update: () => {
      const r = run();
      const d = deviceById(r.device as string);
      const v = Number(onlyDigits(r.form.down));
      const m = minDown(d.price);
      if (!v || v < m || v >= d.price) {
        r.errs.down = v >= d.price ? "Down payment must be less than the device price." : `Down payment must be at least ${naira(m)}.`;
        vfail("s4", ["down payment"]);
        rerenderKeep();
        return;
      }
      r.errs.down = null;
      r.offer = offerFor(d.price, v);
      r.form.down = String(v);
      toast("Offer updated");
      rerenderKeep();
    },
    s4accept: () => {
      const r = run();
      const o = r.offer as Offer;
      if (r.c.downWanted && o.down !== r.c.downWanted && !r.downChecked) {
        r.downChecked = true;
        penal("DOWN", 5, `Customer asked for a ${naira(r.c.downWanted)} down payment; offer accepted at ${naira(o.down)}. Use Update offer.`);
      }
      if (o.totalNow > r.c.cash && !r.lied.includes(6) && !r.overBudgetPen) {
        r.overBudgetPen = true;
        penal("UNAFFORDABLE", 15, `Accepted ${naira(o.totalNow)} to pay now, but the customer only has ${naira(r.c.cash)}.`);
      }
      newCode();
      goStep(4, "confirm");
    },
    s4device: () => goStep(2),
    s4decline: () =>
      confirmDialog("Decline this offer?", "This ends the application for this customer.", "Decline", () => {
        penal("JUDGE", 15, "Declined an offer the customer could take. Use Update offer or Choose a different device.");
        endRun("Declined the offer");
      }),
    s4resend: () => {
      newCode();
      toast("New code sent");
      run().errs.s4c = null;
      rerenderKeep();
    },
    s4confirm: () => {
      const r = run();
      const v = onlyDigits(r.form.code);
      if (r.lied.includes(3)) {
        critical("READY_FALSE", "Ticked \"access to the SIM linked to BVN\" but the customer didn't have it. The confirmation code went to a SIM they don't have, so the application stalled.");
        endRun("Stalled: customer couldn't receive the code");
        return;
      }
      if (v.length !== 6) {
        r.errs.s4c = "Enter the 6-digit code.";
        vfail("s4c", ["code"]);
        rerenderKeep();
        return;
      }
      if (v !== r.code) {
        r.errs.s4c = "That code is incorrect. Check the latest message on the customer's phone.";
        penal("CODE", 2, "Entered a wrong confirmation code.");
        rerenderKeep();
        return;
      }
      if (r.scen.id === "code_expired" && !r.expiredShown) {
        r.expiredShown = true;
        r.errs.s4c = "This code has expired. Tap Resend code to get a new one.";
        rerenderKeep();
        return;
      }
      goStep(5);
    },
    s5pay: () => payNow(),
    s5newlink: () => toast("New payment link generated"),
    s5refresh: () => {
      const r = run();
      if (!r.payPending) {
        toast("No payment yet");
        return;
      }
      r.payRefresh++;
      if (r.payRefresh >= 2) {
        r.payPending = false;
        toast("Payment confirmed");
        goStep(6);
      } else toast("Still waiting for the payment provider…");
    },
    s6go: () => s6submit(),
    s6cont: () => goStep(7),
    s6resend: () => toast("Request sent again on WhatsApp"),
    s6replace: (b) => s6replace(Number(b.dataset.i)),
    s7mandate: () => {
      const r = run();
      if (r.lied.includes(4) || r.lied.includes(5)) {
        critical("READY_FALSE", "A readiness item about the customer's bank account wasn't true.");
        endRun("Stalled at collections");
        return;
      }
      // Closing the mandate page and reopening it carries on where the MBE left off.
      paystack(r.mf.stage ?? "phone");
    },
    s7mrefresh: () => {
      const r = run();
      if (r.mandate === "WAITING") {
        r.mandate = "ACTIVE";
        toast("Mandate active");
      } else toast("No change yet");
      rerenderKeep();
    },
    s7sweep: () => mono(),
    s7regen: () => {
      run().regen = true;
      toast("New account sweep link ready");
    },
    s7srefresh: () => {
      const r = run();
      if (r.sweep !== "WAITING") {
        toast("Not started yet");
        return;
      }
      r.sweepRefresh++;
      if (r.scen.id === "sweep_stuck" && !r.regenAfterStuck) {
        if (r.sweepRefresh >= 2) fireEvent("sweep_stuck", () => rerenderKeep());
        else toast("Still waiting…");
      } else {
        r.sweep = "ACTIVE";
        toast("Account sweep active");
      }
      rerenderKeep();
    },
    s7backup: () => {
      run().sweep = "ACTIVE";
      toast("Backup direct debit set up");
      rerenderKeep();
    },
    s7go: () => {
      const r = run();
      const yes = (r.refStatus ?? []).filter((x) => x.s === "YES").length;
      if (r.scen.id === "ref_no" && yes < 2) {
        if (!r.refBlock) {
          r.refBlock = true;
          penal("REF_NOT_REPLACED", 5, "Tried to move to pickup with fewer than 2 confirmed referees.");
        }
        r.errs.s7 = "Device release stays locked until at least 2 referees confirm. Go back to referee status and send a replacement.";
        rerenderKeep();
        later(() => goStep(6, "status"), 1600);
        return;
      }
      r.refStatus?.forEach((x) => {
        if (x.s === "PENDING") x.s = "YES";
      });
      goStep(8);
    },
    s8go: () => {
      const r = run();
      if (!r.store) {
        r.errs.s8 = "Choose a pickup store from the list.";
        vfail("s8", ["pickup store"]);
        rerenderKeep();
        return;
      }
      if (r.store !== r.c.store) penal("STORE", 5, `Chose ${storeById(r.store).name}; the customer wants to collect near ${r.c.area}.`);
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789_-";
      r.pickupCode = Array.from({ length: 44 }, () => chars[rint(0, chars.length - 1)]).join("");
      goStep(8, "ready");
    },
    finish: () => endRun("Completed all 8 steps", true),
  };

  function makeOffer() {
    const r = run();
    const d = deviceById(r.device as string);
    r.offer = offerFor(d.price, minDown(d.price));
    r.form.down = String(r.offer.down);
    r.form.tenure = "6 months";
  }
  function newCode() {
    const r = run();
    r.code = String(rint(100000, 999999));
    sendSms(`Sapphire: ${r.code} is your code to confirm your DevFin offer. It expires in 10 minutes.`);
  }

  function s3submit() {
    const r = run();
    const f = r.form as Record<string, string | undefined> & { tc?: boolean; pp?: boolean };
    const c = r.c;
    const e: Record<string, string> = {};
    const need = ["name", "phone", "bvn", "nin", "dob", "state", "email", "address", "gender", "marital", "schooling", "employment", "income", "bank", "acct"];
    need.forEach((k) => {
      if (!String(f[k] ?? "").trim()) e[k] = "Please fill in this field.";
    });
    const s = (k: string) => String(f[k] ?? "");
    if (s("phone") && !/^0\d{10}$/.test(s("phone"))) e.phone = "Enter an 11-digit number that starts with 0.";
    if (s("bvn") && !/^\d{11}$/.test(s("bvn"))) e.bvn = "BVN must be 11 digits.";
    if (s("nin") && !/^\d{11}$/.test(s("nin"))) e.nin = "NIN must be 11 digits.";
    if (s("email") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s("email"))) e.email = "Enter a valid email address.";
    if (s("address") && s("address").trim().length < 10) e.address = "At least 10 characters.";
    if ((s("employment") === "Employed" || s("employment") === "Self-employed") && !s("job").trim()) e.job = "Required if employed or self-employed.";
    if (s("acct") && !/^\d{10}$/.test(s("acct"))) e.acct = "Account number must be 10 digits.";
    const terms = !r.form.tc || !r.form.pp ? "Accept the Terms & Conditions and the Privacy Policy to continue." : null;
    const bad = Object.keys(e);
    r.errs = { ...e, s3: terms ?? (bad.length ? "Fix the highlighted fields." : null) };
    if (bad.length || terms) {
      vfail("s3", bad.concat(terms ? ["terms"] : []));
      rerenderKeep();
      focusFirstErr();
      return;
    }
    if (s("bvn") !== c.bvn || s("nin") !== c.nin) {
      if (s("nin") === c.phone || s("nin") === c.bvnPhone) penal("NIN_PHONE", 8, "Entered the customer's phone number as the NIN.");
      else penal("ID_FAIL", 5, "BVN or NIN didn't match the customer's official record.");
      r.idState = "fail";
      r.errs.s3 = "We couldn't match this BVN and NIN to an official record. Check the numbers on the customer's documents.";
      rerenderKeep();
      return;
    }
    const acc = c.accounts.find((x) => x.bank === s("bank") && x.acct === s("acct"));
    if (!acc) {
      penal("DATA", 3, "Bank and account number didn't match any of the customer's accounts.");
      r.errs.acct = `We couldn't find this account at ${s("bank")}.`;
      r.errs.s3 = "Check the bank and account number.";
      rerenderKeep();
      return;
    }
    if (!acc.own && !r.acctNotOwnFlag) {
      r.acctNotOwnFlag = true;
      critical("ACCT_NOT_OWN", `Submitted an account held by ${acc.holder}, not the customer.`);
    }
    // The real app can't know these, so they only show in the results.
    const dobV = `${c.dob.y}-${pad(c.dob.m)}-${pad(c.dob.d)}`;
    const nameL = s("name").toLowerCase();
    const checks: [boolean, string][] = [
      [s("phone") === c.phone, "Phone number"],
      [s("dob") === dobV, "Date of birth"],
      [s("state") === c.state, "State"],
      [s("email").trim().toLowerCase() === c.email, "Email"],
      [s("gender") === c.gender, "Gender"],
      [s("marital") === c.marital, "Marital status"],
      [s("schooling") === c.schooling, "Schooling"],
      [s("employment") === c.employment, "Employment status"],
      [Number(onlyDigits(s("income"))) === c.income, "Monthly income"],
      [nameL.includes(c.first.toLowerCase()) && nameL.includes(c.last.toLowerCase()), "Full name"],
    ];
    checks.forEach(([ok, label]) => {
      if (!ok) penal("DATA", 3, `${label} didn't match the customer's documents.`);
    });
    r.step3done = true;
    makeOffer();
    goStep(4);
  }
  function focusFirstErr() {
    const el = q(".field.err input,.field.err select");
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "center" });
    }
  }

  function payNow() {
    const r = run();
    const o = r.offer as Offer;
    if (r.payPending) penal("PAY_TWICE", 15, "Started a second payment while the first was still processing.");
    if (r.lied.includes(6)) {
      critical("READY_FALSE", "Ticked \"can make the initial deposit\" but the customer couldn't pay today.");
      endRun("Stalled: customer couldn't pay the deposit");
      return;
    }
    if (o.totalNow > r.c.cash) {
      openLayer(
        `<div class="dialog" role="dialog" aria-modal="true"><span class="tag sim">Customer</span><h3>"I only have ${naira(r.c.cash)} with me today."</h3><p class="small muted">The amount due is ${naira(o.totalNow)}. Go back to the offer and choose a different device.</p><button class="btn" id="back4">Back to offer</button></div>`,
        true,
      );
      must("#back4").onclick = () => {
        closeLayer();
        goStep(4);
      };
      return;
    }
    openLayer(
      `<div class="sheet" role="dialog" aria-modal="true"><span class="tag sim">Payment tab (practice)</span><h3>Pay ${naira(o.totalNow)}</h3>
        <p class="small muted">The customer completes payment in a new tab with card, bank transfer, or USSD.</p>
        <button class="btn" id="paydone">Customer completes payment</button><button class="btn ghost" id="paycancel">Close tab without paying</button></div>`,
      false,
    );
    must("#paycancel").onclick = () => {
      closeLayer();
      r.payOpened = true;
      rerenderKeep();
    };
    must("#paydone").onclick = () => {
      closeLayer();
      r.payOpened = true;
      if (r.scen.id === "pay_stuck" && !r.payPendingShown) {
        r.payPendingShown = true;
        r.payPending = true;
        rerenderKeep();
        later(() => fireEvent("pay_pending"), 700);
      } else if (r.payPending) rerenderKeep();
      else {
        toast("Payment confirmed");
        goStep(6);
      }
    };
  }

  function s6submit() {
    const r = run();
    const f = r.form;
    const c = r.c;
    const e: Record<string, string> = {};
    const nums: string[] = [];
    for (let i = 0; i < 3; i++) {
      const n = String(f["rn" + i] ?? "").trim();
      const p = String(f["rp" + i] ?? "").replace(/\s/g, "");
      if (!n) e["rn" + i] = "Please fill in this field.";
      else if (n.split(/\s+/).length < 2) e["rn" + i] = "Enter the referee's full name (first and last).";
      if (!p) e["rp" + i] = "Please fill in this field.";
      else if (p.startsWith("+") || p.startsWith("234")) e["rp" + i] = "Starts with 0, e.g. 08012345678 — not +234";
      else if (!/^0\d{10}$/.test(p)) e["rp" + i] = "Enter an 11-digit WhatsApp number.";
      if (!f["rr" + i]) e["rr" + i] = "Please fill in this field.";
      nums.push(p);
    }
    nums.forEach((p, i) => {
      if (p && nums.indexOf(p) !== i && !e["rp" + i]) e["rp" + i] = "Each referee needs a different WhatsApp number.";
    });
    const bad = Object.keys(e);
    r.errs = { ...e, s6: bad.length ? "Fix the highlighted fields." : null };
    if (bad.length) {
      vfail("s6", bad);
      rerenderKeep();
      focusFirstErr();
      return;
    }
    const known = [...c.refs.filter((x) => !x.self), c.backupRef];
    for (let i = 0; i < 3; i++) {
      const p = nums[i];
      const n = String(f["rn" + i]).trim().toLowerCase();
      if (p === c.phone || p === c.bvnPhone || p === c.selfLine) {
        if (!r.selfFlag) {
          r.selfFlag = true;
          critical("REF_SELF", "Used the customer's own phone line as a referee. Referees must be 3 different people.");
        }
        continue;
      }
      const k = known.find((x) => x.phone === p);
      if (!k) penal("REF_DATA", 3, `Referee ${i + 1}: number ${p} isn't one the customer gave.`);
      else if (n !== k.name.toLowerCase()) penal("REF_DATA", 2, `Referee ${i + 1}: name should be ${k.name}.`);
    }
    r.refStatus = [0, 1, 2].map((i) => ({ name: String(f["rn" + i]).trim(), phone: nums[i], s: "PENDING" as const }));
    goStep(6, "status");
    if (r.scen.id === "ref_no") {
      later(() => {
        const rs = r.refStatus as RefStatus[];
        rs[0].s = "YES";
        rs[1].s = "NO";
        rs[2].s = "NONE";
        rerenderKeep();
        later(() => fireEvent("ref_no", () => fireEvent("collect_now")), 500);
      }, 1800);
    } else later(() => fireEvent("collect_now"), 900);
  }
  function s6replace(i: number) {
    const r = run();
    const f = r.form;
    const c = r.c;
    const e: Record<string, string> = {};
    const n = String(f["xn" + i] ?? "").trim();
    const p = String(f["xp" + i] ?? "").replace(/\s/g, "");
    if (n.split(/\s+/).length < 2) e["xn" + i] = "Enter the referee's full name (first and last).";
    if (!/^0\d{10}$/.test(p)) e["xp" + i] = "Starts with 0, e.g. 08012345678 — not +234";
    if (!f["xr" + i]) e["xr" + i] = "Please fill in this field.";
    const rs = r.refStatus as RefStatus[];
    if (rs.some((x) => x.phone === p)) e["xp" + i] = "This number is already a referee.";
    r.errs = e;
    if (Object.keys(e).length) {
      vfail("s6x", Object.keys(e));
      rerenderKeep();
      return;
    }
    if (p === c.phone || p === c.bvnPhone) critical("REF_SELF", "Used the customer's own number as a replacement referee.");
    else if (p !== c.backupRef.phone && !c.refs.some((x) => x.phone === p)) penal("REF_DATA", 3, `Replacement number ${p} isn't one the customer gave.`);
    rs[i] = { name: n, phone: p, s: "PENDING" };
    toast("New request sent on WhatsApp");
    rerenderKeep();
    later(() => {
      rs[i].s = "YES";
      if (run().step === 6) rerenderKeep();
      toast(`${n} replied YES`);
    }, 2500);
  }

  /* Mandate page (practice copy of the Paystack flow) */
  function paystack(stage: "phone" | "otp" | "bank" | "addr" | "transfer") {
    const r = run();
    const c = r.c;
    const mf = r.mf;
    mf.stage = stage;
    const err = mf.err ? `<div class="note bad">${esc(mf.err)}</div>` : "";
    // The customer's phone stays reachable while the mandate page is open,
    // because the OTP arrives there.
    const latest = c.msgs.slice(0, 2);
    const phonePeek = `<details class="simbox peek"><summary class="tag sim">Customer's phone${c.unread ? ` · ${c.unread} new` : ""}</summary>${
      latest.length ? latest.map((m) => `<div class="msg">${esc(m.text)}</div>`).join("") : `<p class="small muted">No messages yet.</p>`
    }</details>`;
    let body = "";
    if (stage === "phone")
      body = `<p class="center"><b>Enter the phone number linked to your BVN to proceed</b></p>
        <div class="field"><input id="ps_phone" inputmode="numeric" maxlength="11" placeholder="08023456789" aria-label="Phone linked to BVN" value="${esc(mf.phone ?? "")}"></div>${err}<button class="btn" id="psgo">Continue</button>`;
    if (stage === "otp")
      body = `<p class="center"><b>Please enter the OTP that was sent to **** *** **${esc(c.bvnPhone.slice(-2))}</b></p>
        <div class="field"><input id="ps_otp" inputmode="numeric" maxlength="6" placeholder="6-digit OTP" aria-label="OTP"></div>${err}<button class="btn" id="psgo">Continue</button><button class="btn link" id="psresend">Resend OTP via WhatsApp</button>`;
    if (stage === "bank")
      body = `<p class="center"><b>Please provide the details of the bank account you want to link</b></p>
        <div class="list">${PS_LIST.map((b) =>
          r.scen.id === "gtb_down" && b === "GTB"
            ? `<button data-psb="${b}" class="dis">${b}<span class="small">Temporarily unavailable</span></button>`
            : `<button data-psb="${b}" class="${mf.bank === b ? "chosen" : ""}">${b}</button>`,
        ).join("")}</div>
        <div class="field"><input id="ps_acct" inputmode="numeric" maxlength="10" placeholder="Account number" aria-label="Account number" value="${esc(mf.acct ?? "")}"></div>${err}<button class="btn" id="psgo">Continue</button>`;
    if (stage === "addr")
      body = `<div class="doc"><b>${esc(mf.bank)}</b><span class="mono">${esc(mf.acct)}</span></div>
        <div class="field"><input id="ps_addr" placeholder="Your residential address" aria-label="Residential address" value="${esc(mf.addr ?? "")}"></div>
        <div class="row"><div class="field grow"><input id="ps_city" placeholder="City" aria-label="City" value="${esc(mf.city ?? "")}"></div><div class="field grow"><select id="ps_state" aria-label="State"><option value="">State</option>${STATES.map((s) => `<option ${mf.state === s ? "selected" : ""}>${s}</option>`).join("")}</select></div></div>
        ${err}<button class="btn" id="psgo">Continue</button>`;
    if (stage === "transfer")
      body = `<h2 class="center">NGN 50</h2><p class="small muted center">Send this amount to authorize Sentinel to securely charge your bank account</p>
        <div class="doc"><span class="small muted">From ${esc(mf.bank)}</span><b class="mono">${esc(mf.acct)}</b><span class="small">${esc(mf.holder)}</span></div>
        <div class="doc"><span class="small muted">To Paystack-Titan</span><b class="mono">9880218357</b><span class="small">NIBSS DIRECT DEBIT</span></div>
        <div class="note info">ⓘ Only transfers from your bank's app or internet banking are accepted. This is a one-time non-refundable fee.</div>
        ${mf.sent ? `<div class="note ok">The customer sent ₦50 from their bank app.</div>` : `<button class="btn sim" id="pssend">Customer sends ₦50 from their bank app</button>`}
        ${err}<button class="btn" id="psgo">I've sent the money</button>`;
    openLayer(`<div class="sheet" role="dialog" aria-modal="true" aria-label="Mandate page"><div class="row"><span class="tag sim grow">Mandate page (practice)</span><button class="chipbtn" id="psclose">Close</button></div>${body}${phonePeek}</div>`, false, false);
    const peek = q<HTMLDetailsElement>(".peek");
    if (peek)
      peek.ontoggle = () => {
        if (peek.open) {
          c.unread = 0;
          updateBadge();
        }
      };
    must("#psclose").onclick = closeLayer;
    const go = must("#psgo");

    if (stage === "phone")
      go.onclick = () => {
        mf.phone = inputVal("#ps_phone");
        if (mf.phone !== c.bvnPhone) {
          mf.err = "This number isn't linked to the BVN. Use the phone number registered with the customer's BVN.";
          penal("MANDATE", 3, "Entered a phone number that isn't linked to the customer's BVN.");
          paystack("phone");
          return;
        }
        mf.err = null;
        mf.otp = String(rint(100000, 999999));
        sendSms(`Paystack: Your OTP is ${mf.otp}. Do not share it with anyone. (sent to ${c.bvnPhone})`);
        paystack("otp");
      };
    if (stage === "otp") {
      go.onclick = () => {
        if (inputVal("#ps_otp") !== mf.otp) {
          mf.err = "Invalid OTP. Check the latest message on the customer's phone.";
          penal("MANDATE", 2, "Entered a wrong mandate OTP.");
          paystack("otp");
          return;
        }
        mf.err = null;
        paystack("bank");
      };
      must("#psresend").onclick = () => {
        mf.otp = String(rint(100000, 999999));
        sendSms(`Paystack: Your OTP is ${mf.otp}. Do not share it with anyone.`);
      };
    }
    if (stage === "bank") {
      layer.querySelectorAll<HTMLButtonElement>("[data-psb]").forEach(
        (b) =>
          (b.onclick = () => {
            mf.acct = inputVal("#ps_acct");
            if (b.classList.contains("dis")) {
              mf.err = "GTB is temporarily unavailable. Choose another bank.";
              fireEvent("gtb_down", () => paystack("bank"));
              return;
            }
            mf.bank = b.dataset.psb;
            mf.err = null;
            paystack("bank");
          }),
      );
      go.onclick = () => {
        mf.acct = inputVal("#ps_acct");
        if (!mf.bank) {
          mf.err = "Please choose a bank";
          paystack("bank");
          return;
        }
        if (!/^\d{10}$/.test(mf.acct)) {
          mf.err = "Enter a 10-digit account number.";
          paystack("bank");
          return;
        }
        const acc = c.accounts.find((a) => PS_BANK[a.bank] === mf.bank && a.acct === mf.acct);
        if (!acc) {
          mf.err = "We couldn't find this account at the selected bank.";
          penal("MANDATE", 3, "Mandate: bank or account number didn't match the customer's accounts.");
          paystack("bank");
          return;
        }
        if (!acc.own) {
          mf.err = "This account isn't linked to the BVN you verified.";
          if (!r.acctNotOwnFlag) {
            r.acctNotOwnFlag = true;
            critical("ACCT_NOT_OWN", "Tried to link a mandate to an account not in the customer's name.");
          }
          paystack("bank");
          return;
        }
        mf.holder = acc.holder;
        mf.err = null;
        paystack("addr");
      };
    }
    if (stage === "addr")
      go.onclick = () => {
        mf.addr = inputVal("#ps_addr");
        mf.city = inputVal("#ps_city");
        mf.state = must<HTMLSelectElement>("#ps_state").value;
        if (mf.addr.length < 5 || !mf.city || !mf.state) {
          mf.err = "Fill in address, city and state.";
          paystack("addr");
          return;
        }
        mf.err = null;
        paystack("transfer");
        if (hasEvent("cash_50")) later(() => fireEvent("cash_50", () => paystack("transfer")), 300);
      };
    if (stage === "transfer") {
      const s = q("#pssend");
      if (s)
        s.onclick = () => {
          mf.sent = true;
          paystack("transfer");
        };
      go.onclick = () => {
        if (!mf.sent) {
          mf.err = "We haven't received the transfer yet. The customer must send ₦50 from their bank app first.";
          penal("MANDATE", 2, "Pressed \"I've sent the money\" before the customer transferred.");
          paystack("transfer");
          return;
        }
        closeLayer();
        mf.stage = undefined;
        r.mandate = "WAITING";
        toast("Returned to DevFin. Tap Refresh status.");
        rerenderKeep();
      };
    }
  }

  /* Account sweep page (practice copy of the Mono flow) */
  function mono() {
    const r = run();
    const c = r.c;
    if (r.mandate !== "ACTIVE") {
      toast("Finish the mandate first");
      return;
    }
    if (r.scen.id === "sweep_stuck" && r.sweep === "WAITING" && r.eventsDone.sweep_stuck && r.regen) r.regenAfterStuck = true;
    openLayer(
      `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mh"><div class="row"><span class="tag sim grow">Account sweep page (practice)</span><button class="chipbtn" id="mclose">Close</button></div>
        <h3 id="mh">Choose the account to authorise</h3><div class="list">${c.accounts.map((a, i) => `<button data-ma="${i}">${esc(a.bank)} · <span class="mono">${esc(a.acct)}</span></button>`).join("")}</div>
        <p class="small muted">The customer then logs in with their own internet banking and approves.</p></div>`,
      false,
    );
    must("#mclose").onclick = closeLayer;
    layer.querySelectorAll<HTMLButtonElement>("[data-ma]").forEach(
      (b) =>
        (b.onclick = () => {
          const a = c.accounts[Number(b.dataset.ma)];
          closeLayer();
          if (!a.own) {
            if (!r.acctNotOwnFlag) {
              r.acctNotOwnFlag = true;
              critical("ACCT_NOT_OWN", "Authorised account sweep on an account not in the customer's name.");
            }
            toast("Rejected: account isn't in the customer's name");
            return;
          }
          r.sweep = "WAITING";
          toast("Authorised. Tap Refresh status.");
          rerenderKeep();
        }),
    );
  }

  /* ---------- results ---------- */
  function resultsView() {
    const L = S.last as Result;
    const a = L.input;
    const byStep = new Map<number, LogEntry[]>();
    L.log.forEach((l) => byStep.set(l.step, [...(byStep.get(l.step) ?? []), l]));
    const steps = [...byStep.keys()].sort((x, y) => x - y);
    return `<div class="card gap14">
      <span class="tag sim">${a.mode === "assessment" ? "Assessment" : "Practice"} · ${esc(L.title)}</span>
      <div class="scoreRing"><span class="n num ${L.passed ? "good" : "bad"}">${L.score}</span>
        <div><span class="pill ${L.passed ? "ok" : "no"}">${L.passed ? "Passed" : "Not passed"}</span><p class="small muted mt6">${esc(a.endReason)} · ${fmtDur(a.durationSec)}</p></div></div>
      ${a.critical.length ? `<div class="note bad"><div><b>Critical error${a.critical.length > 1 ? "s" : ""}.</b> A critical error fails the run whatever the score.<br>${a.critical.map(esc).join("<br>")}</div></div>` : ""}
      <div id="saveState"><div class="note info"><span class="spin"></span> Saving…</div></div></div>
      <div class="card"><h3>What cost you points</h3>
      ${
        steps.length
          ? steps
              .map(
                (s) =>
                  `<div class="stack6"><span class="small muted strong">Step ${s} · ${STEPS[s - 1]}</span>${(byStep.get(s) ?? []).map((l) => `<div class="ded"><span class="p num">−${l.pts}</span><span class="small">${esc(l.msg)}</span></div>`).join("")}</div>`,
              )
              .join("")
          : `<p class="muted">Nothing. Clean run.</p>`
      }</div>
      ${
        L.scen.events.length
          ? `<div class="card"><h3>Situations</h3>${L.scen.events
              .map((id) => {
                const d = L.eventsDone[id];
                return `<div class="ded"><span class="p">${d ? (d.ok ? "✓" : "✗") : "–"}</span><span class="small"><b>${esc(EVENTS[id].prompt)}</b><br>${esc(EVENTS[id].why)}</span></div>`;
              })
              .join("")}</div>`
          : ""
      }
      <button class="btn" data-again="${L.scen.id}">Try this situation again</button>
      <button class="btn ghost" data-again="">New random customer</button>
      <button class="btn link" data-act="home">Back to situations</button>`;
  }

  function attRow(a: SavedAttempt) {
    return `<div class="trow"><b>${esc(a.title)}</b><span class="pill ${a.passed ? "ok" : "no"}">${a.score}</span>
      <span class="small muted">${a.mode === "assessment" ? "Assessment" : "Practice"} · ${fmtWhen(a.finishedAt)} · ${fmtDur(a.durationSec)}</span><span class="small muted">${a.passed ? "Passed" : "Not passed"}</span>
      ${a.critical.length ? `<span class="small bad span2">${a.critical.map(esc).join(" · ")}</span>` : ""}</div>`;
  }
  function mineView() {
    if (S.mineErr) return `<h1 class="pt6">My results</h1><div class="note bad">${esc(S.mineErr)}</div>`;
    if (S.mine === null) return `<h1 class="pt6">My results</h1><div class="note info"><span class="spin"></span> Loading your attempts…</div>`;
    const list = S.mine;
    const passedIds = new Set(list.filter((a) => a.mode === "assessment" && a.passed).map((a) => a.scenarioId));
    return `<h1 class="pt6">My results</h1>
      <div class="card"><div class="row"><div class="grow"><span class="small muted">Situations passed in assessment</span><br><b class="num stat">${passedIds.size} / ${SCENARIOS.length}</b></div>
        <div><span class="small muted">Attempts</span><br><b class="num stat">${list.length}</b></div></div></div>
      ${list.length ? list.map(attRow).join("") : `<div class="card"><p class="muted">No attempts yet. Start a customer from Practice.</p></div>`}`;
  }

  // Development builds expose the run state so the end-to-end test can read
  // the generated customer. Production builds never include it.
  if (process.env.NODE_ENV !== "production") (host as HTMLElement & { __sim?: unknown }).__sim = { state: S, startRun };

  render();
  return () => {
    S.run?.timers.forEach((t) => window.clearTimeout(t));
    window.clearTimeout(toastTimer);
    document.body.style.overflow = "";
    host.innerHTML = "";
  };
}
