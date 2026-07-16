import Link from "next/link";
import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";

export default async function Home() {
  const { user } = await withAuth();
  if (user) {
    redirect("/recipes");
  }

  return (
    <main className="app-theme-page relative overflow-hidden px-6 py-12">
      <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-cyan-200/35 blur-3xl dark:bg-cyan-500/25" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-violet-300/35 blur-3xl dark:bg-violet-500/25" />
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-start justify-center gap-6">
        <section className="app-theme-card w-full rounded-3xl p-8">
          <p className="app-theme-muted text-xs uppercase tracking-[0.24em]">Picknic</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Plan meals with calm, modern momentum.</h1>
          <p className="app-theme-muted mt-3">
            Build weekly plans, maintain a household recipe collection, and auto-generate shopping lists from your
            planned recipes.
          </p>
          <div className="mt-6 flex gap-3">
            <Link className="app-theme-primary-button rounded-2xl px-5 py-2 text-sm font-medium" href="/sign-in">
              Sign in
            </Link>
            <Link className="app-theme-secondary-button rounded-2xl px-5 py-2 text-sm font-medium" href="/sign-up">
              Create account
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
