import Link from "next/link";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { isAiRecipeImportAvailable } from "@/lib/ai-config";
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

  return <main className="app-theme-page app-shell recipe-authoring-shell"><AppNav currentPath="/recipes" /><RecipeEditorClient aiRecipeImportEnabled={await isAiRecipeImportAvailable()} /></main>;
}
