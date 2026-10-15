import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Simulator } from "@/components/Simulator";
import { SignOutButton } from "@/components/SignOutButton";

export default async function Home() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <main>
      <div className="wrap topline">
        <span className="small muted">Signed in as {user.name}</span>
        <SignOutButton />
      </div>
      <Simulator user={{ name: user.name, staffId: user.demo ? "" : user.staffCode, isTrainer: user.role === "trainer", isDemo: user.demo }} />
    </main>
  );
}
