import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Sign in · DevFin Practice Lab" };

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <main className="wrap login">
      <header className="stack6 pt6">
        <span className="tag sim">Sapphire DevFin · MBE training</span>
        <h1>DevFin Practice Lab</h1>
        <p className="muted">Practise the device finance application on made-up customers before you serve real ones.</p>
      </header>
      <LoginForm />
    </main>
  );
}
