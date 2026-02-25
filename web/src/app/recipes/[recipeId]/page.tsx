import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { AppPageShell } from "@/app/_components/page-shell";

type PageProps = {
  params: Promise<{ recipeId: string }>;
};

export default async function RecipeDetailPage({ params }: PageProps) {
  const { recipeId } = await params;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return (
      <main className="app-theme-page px-6 py-12">
        <section className="app-theme-card mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 rounded-3xl p-8">
          <h1 className="text-3xl font-semibold tracking-tight">Recipe</h1>
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

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId: membership.householdId },
    include: {
      ingredients: { orderBy: { position: "asc" } },
      steps: { orderBy: { position: "asc" } },
    },
  });

  if (!recipe) {
    notFound();
  }

  return (
    <AppPageShell
      currentPath="/recipes"
      eyebrow="Recipe detail"
      title={recipe.title}
      subtitle={recipe.description ?? undefined}
      maxWidthClassName="max-w-5xl"
      headerChildren={
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="app-theme-link rounded-full px-4 py-2">Servings: {recipe.servings}</span>
          <Link className="app-theme-link rounded-full px-4 py-2" href="/recipes">
            Back to recipes
          </Link>
        </div>
      }
    >
      <section className="app-theme-card rounded-3xl p-6">
          <h2 className="text-xl font-semibold">Ingredients</h2>
          {recipe.ingredients.length === 0 ? (
            <p className="app-theme-muted mt-3 text-sm">No ingredients listed.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {recipe.ingredients.map((ingredient) => (
                <li key={ingredient.id} className="rounded-xl border border-white/35 bg-white/65 px-3 py-2 dark:border-white/20 dark:bg-white/8">
                  {ingredient.quantity ? `${ingredient.quantity} ` : ""}
                  {ingredient.unit ? `${ingredient.unit} ` : ""}
                  {ingredient.name}
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="app-theme-card rounded-3xl p-6">
          <h2 className="text-xl font-semibold">Steps</h2>
          {recipe.steps.length === 0 ? (
            <p className="app-theme-muted mt-3 text-sm">No steps listed.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {recipe.steps.map((step) => (
                <li key={step.id} className="rounded-xl border border-white/35 bg-white/65 px-4 py-3 dark:border-white/20 dark:bg-white/8">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] app-theme-muted">Step {step.position}</p>
                  <p className="mt-1 text-sm">{step.instruction}</p>
                </li>
              ))}
            </ol>
          )}
      </section>
    </AppPageShell>
  );
}
