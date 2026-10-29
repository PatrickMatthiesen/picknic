import { RecipeVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readRecipeSnapshot } from "@/lib/recipe-revisions";
import { matchesRecipeSearch, recipeSearchPage, type RecipeSearchFilters } from "@/lib/recipe-search";
export async function loadRecipeSearchPage(options: RecipeSearchFilters & { userId: string; householdId: string; view: "mine" | "all" | "saved" | "collections" | "discover"; collectionId?: string; page?: string; pageSize?: number }) {
  const { userId, householdId, view } = options;
  // Fetch all accessible candidates. Filter the displayed content before pagination,
  // since private live fields must never influence retained-snapshot search results.
  const recipes = await prisma.recipe.findMany({
    where: view === "discover" ? { deletedAt: null, visibility: RecipeVisibility.PUBLIC, NOT: { householdId } }
      : view === "collections" ? { collectionItems: { some: { collection: { userId, ...(options.collectionId ? { id: options.collectionId } : {}) } } } }
      : view === "saved" ? { saves: { some: { userId } } }
      : { OR: [{ householdId, deletedAt: null }, ...(view === "all" ? [{ visibility: RecipeVisibility.PUBLIC, deletedAt: null }] : []), { saves: { some: { userId } } }] },
    include: { ingredients: true, steps: true, saves: { where: { userId }, select: { userId: true, lastSeenRevisionId: true } }, collectionItems: { where: { collection: { userId } }, select: { collectionId: true } } },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  const ids = recipes.filter(recipe => recipe.householdId !== householdId).map(recipe => recipe.latestRevisionId).filter((id): id is string => !!id);
  const revisions = ids.length ? await prisma.recipeRevision.findMany({ where: { id: { in: ids } } }) : [];
  const snapshots = new Map(revisions.map(revision => [revision.id, readRecipeSnapshot(revision.snapshot)]));
  const displayed = recipes.map(recipe => {
    if (recipe.householdId === householdId && !recipe.deletedAt) return recipe;
    const snapshot = recipe.latestRevisionId ? snapshots.get(recipe.latestRevisionId) : undefined;
    if (!snapshot) return null;
    return { ...recipe, ...snapshot, id: recipe.id, ingredients: snapshot.ingredients.map(item => ({ ...item, recipeId: recipe.id })), steps: snapshot.steps };
  });
  return recipeSearchPage(displayed.filter(recipe => recipe !== null).filter(recipe => matchesRecipeSearch(recipe, options)), options.page, options.pageSize ?? 24);
}
