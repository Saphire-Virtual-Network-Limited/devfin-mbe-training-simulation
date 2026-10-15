import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { FIELD_READY_COUNT, trainerReport } from "@/lib/trainer";
import { SCENARIOS } from "@/sim/scenarios";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata = { title: "Trainer view · DevFin Practice Lab" };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–";

export default async function TrainerPage({ searchParams }: { searchParams: Promise<{ demo?: string; open?: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "trainer") redirect("/");

  const { demo, open } = await searchParams;
  const includeDemo = demo === "1";
  const report = await trainerReport(includeDemo);
  const ready = report.trainees.filter((t) => t.passedScenarios >= FIELD_READY_COUNT).length;
  const max = report.topMistakes[0]?.count ?? 1;
  const total = SCENARIOS.length;
  const href = (o?: string) => {
    const p = new URLSearchParams();
    if (includeDemo) p.set("demo", "1");
    if (o) p.set("open", o);
    const s = p.toString();
    return s ? `/trainer?${s}` : "/trainer";
  };

  return (
    <main className="wrap">
      <div className="topline">
        <span className="small muted">Signed in as {user.name}</span>
        <SignOutButton />
      </div>
      <nav className="nav" aria-label="Sections">
        <Link href="/">Practice</Link>
        <span aria-current="true" className="navcurrent">Trainer</span>
      </nav>

      <h1 className="pt6">Trainer view</h1>
      <p className="muted small">
        An MBE is field-ready when they pass at least {FIELD_READY_COUNT} of {total} situations in assessment mode.
      </p>

      <div className="card">
        <div className="row">
          <div className="grow"><span className="small muted">Trainees</span><br /><b className="num stat">{report.trainees.length}</b></div>
          <div className="grow"><span className="small muted">Field-ready</span><br /><b className="num stat">{ready}</b></div>
          <div><span className="small muted">Attempts</span><br /><b className="num stat">{report.totalAttempts}</b></div>
        </div>
        <Link className="small" href={includeDemo ? "/trainer" : "/trainer?demo=1"}>
          {includeDemo ? "Hide demo account" : "Include demo account"}
        </Link>
      </div>

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

      {report.trainees.length === 0 ? (
        <div className="card"><p className="muted">No trainees yet. Results appear here as soon as an MBE signs in and finishes a customer.</p></div>
      ) : (
        report.trainees.map((t) => {
          const isOpen = open === t.id;
          const status = t.passedScenarios >= FIELD_READY_COUNT ? "ok" : t.passedScenarios ? "wait" : "idle";
          return (
            <div key={t.id} className="stack8">
              <Link className="trow" href={href(isOpen ? undefined : t.id)} aria-expanded={isOpen}>
                <b>{t.name}{t.isDemo ? " (demo)" : ""}</b>
                <span className={`pill ${status}`}>{t.passedScenarios}/{total}</span>
                <span className="small muted">{t.isDemo ? "Demo account" : t.staffCode}</span>
                <span className="small muted">{t.attempts} attempt{t.attempts === 1 ? "" : "s"}</span>
                <span className="small muted span2">Best assessment: {t.bestAssessment ?? "–"} · Last active {when(t.lastActive)}</span>
              </Link>
              {isOpen && (
                <div className="drill">
                  {t.recent.length === 0 ? (
                    <p className="small muted">No attempts yet.</p>
                  ) : (
                    t.recent.map((a) => (
                      <div key={a.id} className="trow static">
                        <b>{a.title}</b>
                        <span className={`pill ${a.passed ? "ok" : "no"}`}>{a.score}</span>
                        <span className="small muted">{a.mode === "assessment" ? "Assessment" : "Practice"} · {when(a.finishedAt)}</span>
                        <span className="small muted">{a.passed ? "Passed" : "Not passed"}</span>
                        {a.critical.length > 0 && <span className="small bad span2">{a.critical.join(" · ")}</span>}
                        {a.mistakes.slice(0, 6).map((m, i) => (
                          <span key={i} className="small muted span2">−{m.pts} {m.msg}</span>
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
