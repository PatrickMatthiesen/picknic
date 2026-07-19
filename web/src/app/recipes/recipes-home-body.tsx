import { RecipeVisibility } from "@prisma/client";
import { Bookmark, FolderPlus, Globe2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppPageShell } from "@/app/_components/page-shell";
import { RecipeImage } from "@/app/_components/recipe-image";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { ensureRecipeRevision, readRecipeSnapshot } from "@/lib/recipe-revisions";

type RecipesHomeBodyProps = {
  searchParams: Promise<{ q?: string; view?: string; collection?: string }>;
  currentPath: "/recipes";
  searchActionPath: "/recipes";
};

const VIEWS = ["mine", "collections", "discover"] as const;
type View = (typeof VIEWS)[number];

function hrefFor(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => value && params.set(key, value));
  return `/recipes${params.size ? `?${params}` : ""}`;
}

export async function RecipesHomeBody({ searchParams, currentPath, searchActionPath }: RecipesHomeBodyProps) {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  if (!membership) return <main className="app-theme-page grid min-h-screen place-items-center p-6">No household is connected to this account.</main>;

  const search = await searchParams;
  const query = search.q?.trim() ?? "";
  const view = VIEWS.includes(search.view as View) ? (search.view as View) : "mine";

  async function createCollection(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) throw new Error("Enter a collection name.");
    const context = await requireAppAuthContext();
    await prisma.recipeCollection.upsert({
      where: { userId_name: { userId: context.userId, name } },
      update: {},
      create: { userId: context.userId, name },
    });
    revalidatePath("/recipes");
    redirect("/recipes?view=collections");
  }

  async function toggleSavedRecipe(formData: FormData) {
    "use server";
    const recipeId = String(formData.get("recipeId") ?? "");
    const returnTo = String(formData.get("returnTo") ?? "/recipes");
    const context = await requireAppAuthContext();
    const existing = await prisma.savedRecipe.findUnique({ where: { userId_recipeId: { userId: context.userId, recipeId } } });
    if (existing) await prisma.savedRecipe.delete({ where: { userId_recipeId: { userId: context.userId, recipeId } } });
    else {
      const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
      if (!activeMembership) throw new Error("No household is connected to this account.");
      const available = await prisma.recipe.findFirst({
        where: {
          id: recipeId,
          deletedAt: null,
          OR: [{ householdId: activeMembership.householdId }, { visibility: RecipeVisibility.PUBLIC }],
        },
        select: { id: true, createdById: true },
      });
      if (!available) throw new Error("This recipe cannot be saved.");
      const revision = await ensureRecipeRevision(prisma, available.id, available.createdById);
      await prisma.savedRecipe.create({ data: { userId: context.userId, recipeId, lastSeenRevisionId: revision.id } });
    }
    revalidatePath("/recipes");
    redirect(returnTo);
  }

  async function addToCollection(formData: FormData) {
    "use server";
    const recipeId = String(formData.get("recipeId") ?? "");
    const collectionId = String(formData.get("collectionId") ?? "");
    const returnTo = String(formData.get("returnTo") ?? "/recipes");
    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household is connected to this account.");
    const collection = await prisma.recipeCollection.findFirst({ where: { id: collectionId, userId: context.userId }, select: { id: true, _count: { select: { items: true } } } });
    if (!collection) throw new Error("Choose one of your collections.");
    const available = await prisma.recipe.findFirst({
      where: {
        id: recipeId,
        OR: [
          { householdId: activeMembership.householdId, deletedAt: null },
          { visibility: RecipeVisibility.PUBLIC, deletedAt: null },
          { saves: { some: { userId: context.userId } }, latestRevisionId: { not: null } },
        ],
      },
      select: { id: true, createdById: true, householdId: true, latestRevisionId: true, visibility: true },
    });
    if (!available) throw new Error("This recipe cannot be added to a collection.");
    if (available.householdId !== activeMembership.householdId) {
      const revision = available.visibility === RecipeVisibility.PUBLIC
        ? await ensureRecipeRevision(prisma, available.id, available.createdById)
        : available.latestRevisionId
          ? await prisma.recipeRevision.findUniqueOrThrow({ where: { id: available.latestRevisionId } })
          : null;
      if (!revision) throw new Error("The retained recipe version is no longer available.");
      await prisma.savedRecipe.upsert({
        where: { userId_recipeId: { userId: context.userId, recipeId } },
        update: {},
        create: { userId: context.userId, recipeId, lastSeenRevisionId: revision.id },
      });
    }
    await prisma.recipeCollectionItem.upsert({
      where: { collectionId_recipeId: { collectionId, recipeId } },
      update: {},
      create: { collectionId, recipeId, position: collection._count.items + 1 },
    });
    revalidatePath("/recipes");
    redirect(returnTo);
  }

  const [collections, recipes] = await Promise.all([
    prisma.recipeCollection.findMany({
      where: { userId },
      include: { _count: { select: { items: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.recipe.findMany({
      where: {
        ...(query && view === "discover" ? { title: { contains: query, mode: "insensitive" } } : {}),
        ...(view === "discover"
          ? { deletedAt: null, visibility: RecipeVisibility.PUBLIC, NOT: { householdId: membership.householdId } }
          : view === "collections"
            ? { collectionItems: { some: { collection: { userId, ...(search.collection ? { id: search.collection } : {}) } } } }
            : { OR: [{ householdId: membership.householdId, deletedAt: null }, { saves: { some: { userId } } }] }),
      },
      include: {
        ingredients: { select: { id: true } },
        steps: { select: { id: true } },
        saves: { where: { userId }, select: { userId: true, lastSeenRevisionId: true } },
        collectionItems: { where: { collection: { userId } }, select: { collectionId: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 48,
    }),
  ]);
  const retainedRevisionIds = recipes
    .filter((recipe) => recipe.householdId !== membership.householdId && (recipe.visibility !== RecipeVisibility.PUBLIC || recipe.deletedAt))
    .map((recipe) => recipe.latestRevisionId)
    .filter((id): id is string => id !== null);
  const retainedRevisions = retainedRevisionIds.length
    ? await prisma.recipeRevision.findMany({ where: { id: { in: retainedRevisionIds } } })
    : [];
  const retainedSnapshots = new Map(retainedRevisions.map((revision) => [revision.id, readRecipeSnapshot(revision.snapshot)]));
  const displayRecipes = recipes.map((recipe) => {
    const snapshot = recipe.latestRevisionId ? retainedSnapshots.get(recipe.latestRevisionId) : null;
    return snapshot
      ? {
          ...recipe,
          ...snapshot,
          id: recipe.id,
          ingredients: snapshot.ingredients.map(({ id }) => ({ id })),
          steps: snapshot.steps.map(({ id }) => ({ id })),
        }
      : recipe;
  });
  const visibleRecipes = query
    ? displayRecipes.filter((recipe) => recipe.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    : displayRecipes;
  const returnTo = hrefFor({ view, q: query || undefined, collection: search.collection });

  return (
    <AppPageShell
      currentPath={currentPath}
      title="Recipes"
      subtitle="Keep the recipes you love, improve them over time, and find something new for this week."
      headerChildren={<Link className="app-theme-primary-button inline-flex items-center gap-2 px-4 py-2 text-sm" href="/recipes/new"><Plus size={17} /> Create recipe</Link>}
    >
      <div className="recipe-library-toolbar">
        <nav className="recipe-library-tabs" aria-label="Recipe library views">
          <Link className={view === "mine" ? "is-active" : undefined} href="/recipes">My recipes</Link>
          <Link className={view === "collections" ? "is-active" : undefined} href="/recipes?view=collections">Collections</Link>
          <Link className={view === "discover" ? "is-active" : undefined} href="/recipes?view=discover">Discover</Link>
        </nav>
        <form className="recipe-search" action={searchActionPath} method="get">
          {view !== "mine" ? <input name="view" type="hidden" value={view} /> : null}
          <Search aria-hidden="true" size={17} />
          <input defaultValue={query} name="q" placeholder="Search recipes" />
        </form>
      </div>

      {view === "collections" ? (
        <section className="collection-strip">
          <form action={createCollection}>
            <FolderPlus aria-hidden="true" size={18} />
            <input aria-label="Collection name" name="name" placeholder="New collection" />
            <button type="submit">Create</button>
          </form>
          {collections.map((collection) => (
            <Link className={search.collection === collection.id ? "is-active" : undefined} href={hrefFor({ view: "collections", collection: collection.id })} key={collection.id}>
              <span>{collection.name}</span><small>{collection._count.items}</small>
            </Link>
          ))}
        </section>
      ) : null}

      {visibleRecipes.length === 0 ? (
        <section className="library-empty">
          <BookOpenEmpty view={view} />
        </section>
      ) : (
        <section className="recipe-library-grid">
          {visibleRecipes.map((recipe) => (
            <article className="library-recipe" key={recipe.id}>
              <Link className="library-recipe-image" href={`/recipes/${recipe.id}`}>
                <RecipeImage alt="" height={240} recipe={recipe} width={360} />
                {recipe.deletedAt ? <span>Original removed</span> : recipe.visibility === RecipeVisibility.PUBLIC ? <span><Globe2 size={13} /> Public</span> : null}
              </Link>
              <div className="library-recipe-copy">
                <Link className="recipe-title" href={`/recipes/${recipe.id}`}>{recipe.title}</Link>
                <p>{recipe.ingredients.length} ingredients · {recipe.steps.length} steps · Serves {recipe.servings}</p>
                {recipe.saves[0]?.lastSeenRevisionId && recipe.latestRevisionId !== recipe.saves[0].lastSeenRevisionId
                  ? <small className="recipe-update-badge">Updated by author</small>
                  : null}
                {recipe.description ? <span>{recipe.description}</span> : null}
              </div>
              <div className="library-recipe-actions">
                <Link className="app-theme-primary-button" href={`/planner?${recipe.householdId !== membership.householdId && (recipe.visibility !== RecipeVisibility.PUBLIC || recipe.deletedAt) ? "view=saved&" : ""}q=${encodeURIComponent(recipe.title)}`}>Plan</Link>
                <form action={toggleSavedRecipe}>
                  <input name="recipeId" type="hidden" value={recipe.id} />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <button aria-label={recipe.saves.length ? `Unsave ${recipe.title}` : `Save ${recipe.title}`} className={recipe.saves.length ? "is-saved" : undefined} type="submit"><Bookmark fill={recipe.saves.length ? "currentColor" : "none"} size={17} /></button>
                </form>
                {collections.length ? (
                  <form action={addToCollection} className="collection-add-form">
                    <input name="recipeId" type="hidden" value={recipe.id} />
                    <input name="returnTo" type="hidden" value={returnTo} />
                    <select aria-label={`Add ${recipe.title} to collection`} name="collectionId" defaultValue=""><option disabled value="">Collection</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select>
                    <button type="submit">Add</button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </AppPageShell>
  );
}

function BookOpenEmpty({ view }: { view: View }) {
  const content = view === "discover"
    ? { title: "No public recipes found", body: "Try a broader search or publish one of your household recipes." }
    : view === "collections"
      ? { title: "This collection is ready", body: "Add recipes from My recipes or Discover when they are useful together." }
      : { title: "Start with tonight", body: "Create a recipe manually or paste one you already use." };
  return <><Bookmark aria-hidden="true" size={24} /><h2>{content.title}</h2><p>{content.body}</p><Link className="app-theme-primary-button px-4 py-2 text-sm" href="/recipes/new">Create recipe</Link></>;
}
