import Link from "next/link";
import { requireAppAuthContext, resolveActiveHouseholdId } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { AppNav } from "@/app/_components/app-nav";
import { Dropdown } from "@/app/_components/dropdown";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function RecipesPage({ searchParams }: PageProps) {
  const { userId, organizationId } = await requireAppAuthContext();
  const householdId = await resolveActiveHouseholdId(userId, organizationId);
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  if (!householdId) {
    return (
      <main className="app-theme-page px-6 py-12">
        <section className="app-theme-card mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 rounded-3xl p-8">
          <h1 className="text-3xl font-semibold tracking-tight">Recipes</h1>
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

  const recipes = await prisma.recipe.findMany({
    where: {
      householdId,
      ...(query
        ? {
            title: {
              contains: query,
              mode: "insensitive" as const,
            },
          }
        : {}),
    },
    include: {
      ingredients: { orderBy: { position: "asc" } },
      steps: { orderBy: { position: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <main className="app-theme-page relative overflow-hidden px-6 py-12">
      <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-cyan-200/35 blur-3xl dark:bg-cyan-500/25" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-violet-300/35 blur-3xl dark:bg-violet-500/25" />
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6">
        <header className="app-theme-card space-y-3 rounded-3xl p-7">
          <p className="text-xs tracking-[0.24em] uppercase app-theme-muted">Recipes</p>
          <h1 className="text-3xl font-semibold tracking-tight">Browse, create, and parse recipes.</h1>
          <AppNav currentPath="/recipes" />
        </header>

        <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2 text-sm">
            <Link className="app-theme-primary-button rounded-full px-4 py-2 font-medium" href="/recipes/new">
              New recipe
            </Link>
            <Dropdown
              autoCloseOnOutsideClick
              className="relative"
              label="Parse recipe"
              panelClassName="app-theme-card absolute left-0 z-10 mt-2 w-64 rounded-2xl p-2"
              summaryClassName="app-theme-secondary-button cursor-pointer list-none rounded-full px-4 py-2 font-medium"
            >
              <div className="flex flex-col gap-1 text-sm">
                <Link
                  className="app-theme-link app-dropdown-option rounded-xl px-3 py-2 font-medium"
                  href="/recipes/new?method=copy-paste"
                >
                  🍝 Copy paste
                </Link>
                <Link
                  className="app-theme-link app-dropdown-option rounded-xl px-3 py-2 font-medium"
                  href="/recipes/new?method=url"
                >
                  Add with URL (soon)
                </Link>
                <Link
                  className="app-theme-link app-dropdown-option rounded-xl px-3 py-2 font-medium"
                  href="/recipes/new?method=image"
                >
                  Add with image (soon)
                </Link>
              </div>
            </Dropdown>
          </div>

          <form action="/recipes" method="get" className="w-full md:w-80">
            <input
              className="app-theme-input w-full rounded-full px-4 py-2 text-sm"
              defaultValue={query}
              name="q"
              placeholder="Search recipes..."
            />
          </form>
        </section>

        {query ? (
          <p className="app-theme-muted text-sm">
            Showing results for &quot;<span className="font-semibold">{query}</span>&quot;
          </p>
        ) : null}

        <section className="space-y-3">
          {recipes.length === 0 ? (
            <p className="app-theme-card app-theme-muted rounded-3xl border-dashed p-5">
              No recipes yet. Use New recipe or Parse recipe to get started.
            </p>
          ) : (
            recipes.map((recipe) => (
              <article className="app-theme-card rounded-3xl p-5" key={recipe.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{recipe.title}</h2>
                    {recipe.description ? <p className="app-theme-muted mt-1 text-sm">{recipe.description}</p> : null}
                    <p className="app-theme-muted mt-2 text-xs">
                      {recipe.ingredients.length} ingredients · {recipe.steps.length} steps
                    </p>
                  </div>
                  <Link className="app-theme-link rounded-full px-4 py-2 text-sm font-medium" href={`/recipes/${recipe.id}`}>
                    Open recipe
                  </Link>
                </div>

                {recipe.ingredients.length > 0 ? (
                  <div className="mt-4">
                    <p className="app-theme-muted text-xs font-medium uppercase tracking-wide">Preview ingredients</p>
                    <ul className="app-theme-muted mt-1 list-inside list-disc text-sm">
                      {recipe.ingredients.slice(0, 4).map((ingredient) => (
                        <li key={ingredient.id}>
                          {ingredient.quantity ? `${ingredient.quantity} ` : ""}
                          {ingredient.unit ? `${ingredient.unit} ` : ""}
                          {ingredient.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
