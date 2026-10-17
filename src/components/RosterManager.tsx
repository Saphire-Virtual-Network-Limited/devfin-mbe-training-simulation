"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = { added: number; updated: number; phoneTaken: string[]; errors: string[] };

async function send(method: "POST" | "PATCH", body: unknown) {
  const res = await fetch("/api/roster", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) as (Result & { error?: { message?: string } }) | null;
  if (!res.ok) throw new Error(json?.error?.message ?? "That didn't save. Try again.");
  return json as Result;
}

function summary(r: Result): string {
  const parts = [`${r.added} added`, `${r.updated} updated`];
  if (r.phoneTaken.length) parts.push(`${r.phoneTaken.length} skipped: ${r.phoneTaken.join(", ")}`);
  if (r.errors.length) parts.push(`${r.errors.length} line${r.errors.length > 1 ? "s" : ""} not read: ${r.errors.slice(0, 3).join(" ")}`);
  return parts.join(" · ");
}

/** Add one MBE, or paste a list exported from a spreadsheet. */
export function RosterManager() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    setBusy(true);
    setMsg(null);
    try {
      const r = bulk
        ? await send("POST", { csv: String(f.get("csv") ?? "") })
        : await send("POST", { code: f.get("code"), phone: f.get("phone"), name: f.get("name"), store: f.get("store") });
      setMsg({ ok: r.phoneTaken.length === 0 && r.errors.length === 0, text: summary(r) });
      formEl.reset();
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "That didn't save." });
    }
    setBusy(false);
  }

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <div className="row">
        <h3 className="grow">Add MBEs</h3>
        <button type="button" className="linkbtn" onClick={() => setBulk(!bulk)}>
          {bulk ? "Add one MBE" : "Paste a list"}
        </button>
      </div>
      {bulk ? (
        <div className="field">
          <label htmlFor="csv">One MBE per line: code, phone, name, store</label>
          <textarea id="csv" name="csv" rows={6} placeholder={"MBE-E8CABF, 08031234567, Ada Obi, Ikeja\nMBE-12AB34, 09061234567, Musa Bello, Wuse"} />
          <span className="hint">Copy the four columns from a spreadsheet and paste them here. An existing code is updated, not duplicated.</span>
        </div>
      ) : (
        <>
          <div className="field"><label htmlFor="r-code">MBE code</label><input id="r-code" name="code" placeholder="MBE-E8CABF" autoCapitalize="characters" required /></div>
          <div className="field"><label htmlFor="r-phone">Phone number</label><input id="r-phone" name="phone" type="tel" inputMode="numeric" placeholder="08031234567" required /></div>
          <div className="field"><label htmlFor="r-name">Full name</label><input id="r-name" name="name" required /></div>
          <div className="field"><label htmlFor="r-store">Store or area</label><input id="r-store" name="store" placeholder="Ikeja" /></div>
        </>
      )}
      {msg && <div className={`note ${msg.ok ? "ok" : "wait"}`} role="status">{msg.text}</div>}
      <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : bulk ? "Save list" : "Save MBE"}</button>
    </form>
  );
}

export function ActiveToggle({ code, active }: { code: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="row">
      <button
        type="button"
        className="linkbtn small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await send("PATCH", { code, active: !active });
            router.refresh();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Didn't save.");
          }
          setBusy(false);
        }}
      >
        {active ? "Switch off access" : "Switch access back on"}
      </button>
      {err && <span className="small bad">{err}</span>}
    </span>
  );
}
