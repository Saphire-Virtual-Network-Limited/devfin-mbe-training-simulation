"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { mountSimulator, type SavedAttempt, type SimUser } from "@/sim/app";
import type { AttemptInput } from "@/sim/attempt";

async function saveAttempt(a: AttemptInput): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch("/api/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(a),
  });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return { ok: false, message: body?.error?.message ?? "Something went wrong." };
}

class SignedOutError extends Error {}

async function loadAttempts(): Promise<SavedAttempt[]> {
  const res = await fetch("/api/attempts", { cache: "no-store" });
  if (res.status === 401) throw new SignedOutError("signed out");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { attempts: SavedAttempt[] }).attempts;
}

export function Simulator({ user }: { user: SimUser }) {
  const host = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { name, staffId, isTrainer, isDemo } = user;

  useEffect(() => {
    if (!host.current) return;
    const load = () =>
      loadAttempts().catch((err: unknown) => {
        if (err instanceof SignedOutError) router.replace("/login");
        throw err;
      });
    return mountSimulator(host.current, { user: { name, staffId, isTrainer, isDemo }, saveAttempt, loadAttempts: load });
  }, [name, staffId, isTrainer, isDemo, router]);

  return <div ref={host} />;
}
