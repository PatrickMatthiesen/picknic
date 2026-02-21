import Link from "next/link";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { AppNav } from "@/app/_components/app-nav";
import { RecipeEditorClient } from "./recipe-editor-client";

export default async function NewRecipePage() {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return (
      <main className="app-theme-page px-6 py-12">
        <section className="app-theme-card mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 rounded-3xl p-8">
          <h1 className="text-3xl font-semibold tracking-tight">New recipe</h1>
          <p className="app-theme-muted">
            Your account is authenticated, but no household was found yet. Complete organization setup in WorkOS and sign
            in again.
          </p>
          <Link className="app-theme-link w-fit rounded-full px-4 py-2 text-sm font-medium" href="/">
            Back home
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="app-theme-page relative overflow-hidden px-6 py-12">
      <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-cyan-200/35 blur-3xl dark:bg-cyan-500/25" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-violet-300/35 blur-3xl dark:bg-violet-500/25" />
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6">
        <header className="app-theme-card space-y-3 rounded-3xl p-7">
          <h1 className="text-3xl font-semibold tracking-tight">Create recipe</h1>
          <p className="app-theme-muted">
            Start manually, parse from copy paste, or choose upcoming URL/image import options.
          </p>
          <AppNav currentPath="/recipes" />
          <div className="flex flex-wrap gap-2 text-sm">
            <Link className="app-theme-link rounded-full px-4 py-2" href="/recipes">
              Back to recipes
            </Link>
          </div>
        </header>

        <RecipeEditorClient />
      </div>
    </main>
  );
}
