"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: String(form.get("code") ?? ""),
          phone: String(form.get("phone") ?? ""),
          passcode: String(form.get("passcode") ?? ""),
        }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      if (body?.error?.code === "PASSCODE_REQUIRED") {
        setNeedsPasscode(true);
        setError(null);
      } else {
        setError(body?.error?.message ?? "Sign-in failed. Try again.");
      }
    } catch {
      setError("You appear to be offline. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <h3>Sign in</h3>
      <p className="small muted">Use your MBE code and the phone number your trainer registered for you.</p>
      <div className="field">
        <label htmlFor="code">MBE code</label>
        <input id="code" name="code" placeholder="e.g. MBE-E8CABF" autoComplete="username" autoCapitalize="characters" spellCheck={false} required />
      </div>
      <div className="field">
        <label htmlFor="phone">Phone number</label>
        <input id="phone" name="phone" type="tel" inputMode="numeric" placeholder="08031234567" autoComplete="tel" required />
      </div>
      {needsPasscode && (
        <div className="field">
          <label htmlFor="passcode">Trainer passcode</label>
          <input id="passcode" name="passcode" type="password" autoComplete="current-password" autoFocus required />
          <span className="hint">Trainers enter this as well, because they can change the MBE list.</span>
        </div>
      )}
      {error ? (
        <div className="note bad" role="alert">
          {error}
        </div>
      ) : null}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
