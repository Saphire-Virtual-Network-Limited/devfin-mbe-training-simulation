import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { FIELD_READY_COUNT, trainerReport } from "@/lib/trainer";
import { SCENARIOS } from "@/sim/scenarios";
import { SignOutButton } from "@/components/SignOutButton";
import { ActiveToggle, RosterManager } from "@/components/RosterManager";

export const metadata = { title: "Trainer view · DevFin Practice Lab" };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–";

export default async function TrainerPage({ searchParams }: { searchParams: Promise<{ demo?: string; open?: string; q?: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "trainer") redirect("/");

  const { demo, open, q } = await searchParams;
  const includeDemo = demo === "1";
  const report = await trainerReport(includeDemo);
  const query = (q ?? "").trim().toLowerCase().slice(0, 60);
  const shown = query
    ? report.mbes.filter((m) => `${m.code} ${m.phone} ${m.name} ${m.store}`.toLowerCase().includes(query))
    : report.mbes;
  const practising = report.mbes.filter((m) => m.attempts > 0).length;
  const ready = report.mbes.filter((m) => m.passedScenarios >= FIELD_READY_COUNT).length;
  const max = report.topMistakes[0]?.count ?? 1;
  const total = SCENARIOS.length;
  const href = (o?: string) => {
    const p = new URLSearchParams();
    if (includeDemo) p.set("demo", "1");
    if (query) p.set("q", query);
    if (o) p.set("open", o);
    const s = p.toString();
    return s ? `/trainer?${s}` : "/trainer";
  };

  return (
    <main className="wrap">
      <div className="topline">
        <span className="small muted">Signed in as {user.name} · {user.staffCode}</span>
        <SignOutButton />
      </div>
      <nav className="nav" aria-label="Sections">
        <Link href="/">Practice</Link>
        <span aria-current="true" className="navcurrent">Trainer</span>
      </nav>

      <h1 className="pt6">Trainer view</h1>
      <p className="muted small">
        Each MBE signs in with their code and phone number, and every score is saved against their code. An MBE is
        field-ready when they pass at least {FIELD_READY_COUNT} of {total} situations in assessment mode.
      </p>

      <div className="card">
        <div className="row">
          <div className="grow"><span className="small muted">MBEs on the list</span><br /><b className="num stat">{report.mbes.length}</b></div>
          <div className="grow"><span className="small muted">Practising</span><br /><b className="num stat">{practising}</b></div>
          <div className="grow"><span className="small muted">Field-ready</span><br /><b className="num stat">{ready}</b></div>
          <div><span className="small muted">Attempts</span><br /><b className="num stat">{report.totalAttempts}</b></div>
        </div>
        <Link className="small" href={includeDemo ? "/trainer" : "/trainer?demo=1"}>
          {includeDemo ? "Hide demo account" : "Include demo account"}
        </Link>
      </div>

      <RosterManager />

      {report.topMistakes.length > 0 && (
        <div className="card">
          <h3>Most common mistakes, last 90 days</h3>
          <div className="bars">
            {report.topMistakes.map((m) => (
              <div className="b" key={m.label}>
                <span>{m.label}</span>
                <span className="num right">{m.count}</span>
                <div className="track"><span style={{ width: `${(m.count / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <form className="field" action="/trainer" method="get" role="search">
        <label htmlFor="q">Find an MBE</label>
        <input id="q" name="q" defaultValue={query} placeholder="Code, phone, name or store" />
        {includeDemo && <input type="hidden" name="demo" value="1" />}
      </form>

      {shown.length === 0 ? (
        <div className="card">
          <p className="muted">{report.mbes.length ? "No MBE matches that search." : "No MBEs on the list yet. Add them above, then share the link with them."}</p>
        </div>
      ) : (
        shown.map((m) => {
          const isOpen = open === m.code;
          const status = m.passedScenarios >= FIELD_READY_COUNT ? "ok" : m.passedScenarios ? "wait" : "idle";
          return (
            <div key={m.code} className="stack8">
              <Link className="trow" href={href(isOpen ? undefined : m.code)} aria-expanded={isOpen}>
                <b>{m.name}{m.isDemo ? " (demo)" : ""}{!m.active ? " · switched off" : ""}</b>
                <span className={`pill ${status}`}>{m.passedScenarios}/{total}</span>
                <span className="small mono">{m.code}</span>
                <span className="small mono right">{m.phone}</span>
                <span className="small muted">{m.store || "No store"} · {m.attempts} attempt{m.attempts === 1 ? "" : "s"}</span>
                <span className="small muted right">Best {m.bestAssessment ?? "–"}</span>
                <span className="small muted span2">Last practised {when(m.lastActive)}</span>
              </Link>
              {isOpen && (
                <div className="drill">
                  {!m.isDemo && m.code !== user.staffCode && <ActiveToggle code={m.code} active={m.active} />}
                  {m.recent.length === 0 ? (
                    <p className="small muted">No attempts yet.</p>
                  ) : (
                    m.recent.map((a) => (
                      <div key={a.id} className="trow static">
                        <b>{a.title}</b>
                        <span className={`pill ${a.passed ? "ok" : "no"}`}>{a.score}</span>
                        <span className="small muted">{a.mode === "assessment" ? "Assessment" : "Practice"} · {when(a.finishedAt)}</span>
                        <span className="small muted right">{a.passed ? "Passed" : "Not passed"}</span>
                        {a.critical.length > 0 && <span className="small bad span2">{a.critical.join(" · ")}</span>}
                        {a.mistakes.slice(0, 6).map((x, i) => (
                          <span key={i} className="small muted span2">−{x.pts} {x.msg}</span>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </main>
  );
}
