import Link from "next/link";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { ImportRecipeClient } from "./import-recipe-client";

export default async function ImportRecipePage() {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Import recipe</h1>
        <p className="text-zinc-600">
          Your account is authenticated, but no household was found yet. Complete organization setup in WorkOS and sign
          in again.
        </p>
        <Link className="text-sm font-medium underline" href="/">
          Back home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Import recipe (AI parser)</h1>
        <p className="text-zinc-600">Parse free-form recipe text with GitHub Models, review edits, then save.</p>
        <div className="flex gap-4 text-sm">
          <Link className="underline" href="/recipes">
            Recipes
          </Link>
          <Link className="underline" href="/planner">
            Meal planner
          </Link>
        </div>
      </header>

      <ImportRecipeClient />
    </main>
  );
}
