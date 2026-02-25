import Link from "next/link";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { AppPageShell } from "@/app/_components/page-shell";
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
    <AppPageShell
      currentPath="/recipes"
      title="Create recipe"
      subtitle="Start manually, parse from copy paste, or choose upcoming URL/image import options."
      maxWidthClassName="max-w-5xl"
      headerChildren={
        <div className="flex flex-wrap gap-2 text-sm">
          <Link className="app-theme-link rounded-full px-4 py-2" href="/recipes">
            Back to recipes
          </Link>
        </div>
      }
    >
      <RecipeEditorClient />
    </AppPageShell>
  );
}
